#!/usr/bin/python3
"""Fixed privileged receiver. SSH may replace app code, never proxy/config/data."""
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from uuid import uuid4

BASE = Path('/opt/eduethos')
RELEASES = BASE / 'releases'
BACKUPS = Path('/var/backups/eduethos')
DATABASE = Path('/var/lib/eduethos/eduethos.sqlite')
MAX_ARCHIVE = 25 * 1024 * 1024
MAX_EXPANDED = 40 * 1024 * 1024
MAX_FILE = 8 * 1024 * 1024
REQUIRED = ('server/index.mjs', 'server/store.mjs', 'server/accounts-api.mjs',
            'worker/api.mjs', 'worker/documents.json', 'dist/index.html')
SAFE_ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}


class DeploymentDeadlineExceeded(RuntimeError):
    pass


def run(*args, timeout=100):
    return subprocess.run(args, check=True, capture_output=True, text=True,
                          timeout=timeout, env=SAFE_ENV).stdout.strip()


def unpack(archive, target):
    """Extract only plain application files into a new root-owned directory."""
    total, seen = 0, set()
    with tarfile.open(fileobj=archive, mode='r:gz') as package:
        for count, member in enumerate(package, 1):
            if count > 512:
                raise ValueError('Too many archive entries')
            name = PurePosixPath(member.name)
            if name.is_absolute() or '\\' in member.name or '..' in name.parts:
                raise ValueError('Unsafe archive path')
            if not name.parts or name.parts[0] != 'course-demo':
                raise ValueError('Unexpected archive root')
            parts = name.parts[1:]
            if not parts and member.isdir():
                continue
            if not parts or parts[0] not in {'dist', 'server', 'worker'}:
                raise ValueError('Only application directories can be deployed')
            if any(part.startswith('.') for part in parts):
                raise ValueError('Hidden files cannot be deployed')
            relative = Path(*parts)
            if str(relative) in seen:
                raise ValueError('Duplicate archive entry')
            seen.add(str(relative))
            dest = target / relative
            if member.isdir():
                dest.mkdir(parents=True, exist_ok=True, mode=0o755)
            elif member.isfile():
                if dest.suffix not in {'.html', '.css', '.js', '.mjs', '.json'}:
                    raise ValueError('Unexpected application file type')
                total += member.size
                if member.size < 0 or member.size > MAX_FILE or total > MAX_EXPANDED:
                    raise ValueError('Application archive is too large')
                dest.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with package.extractfile(member) as source, dest.open('xb') as output:
                    while chunk := source.read(65536):
                        output.write(chunk)
                dest.chmod(0o644)
            else:
                raise ValueError('Links and special files are forbidden')
    for name in REQUIRED:
        if not (target / name).is_file():
            raise ValueError('Application package is incomplete')
    documents = json.loads((target / 'worker/documents.json').read_text())
    if not isinstance(documents, list) or not documents:
        raise ValueError('Knowledge documents are missing')


def switch_to(target):
    link = BASE / ('.current-' + uuid4().hex)
    try:
        link.symlink_to(target, target_is_directory=True)
        os.replace(link, BASE / 'current')
    finally:
        link.unlink(missing_ok=True)


def health():
    with urllib.request.urlopen('http://127.0.0.1:8767/api/health', timeout=3) as response:
        data = json.load(response)
    if data.get('accountMode') != 'isolated' or not data.get('knowledgeCount', 0):
        raise ValueError('Unexpected application health')
    return data


def wait_healthy(target, configured):
    for _ in range(30):
        try:
            current_health = health()
            pid = int(run('/usr/bin/systemctl', 'show', 'eduethos', '-p', 'MainPID', '--value'))
            if pid > 0 and Path(f'/proc/{pid}/cwd').resolve() == target.resolve():
                if current_health.get('configured') != configured:
                    raise ValueError('Model configuration changed unexpectedly')
                return
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        time.sleep(1)
    raise RuntimeError('Application failed its post-deployment health check')


def backup_database(stamp):
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup = BACKUPS / (stamp + '.sqlite')
    with sqlite3.connect(DATABASE.as_uri() + '?mode=ro', uri=True) as source:
        with sqlite3.connect(backup) as destination:
            source.backup(destination)
            if destination.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise RuntimeError('Database backup integrity check failed')
    backup.chmod(0o600)
    return backup


def deploy(archive, sha):
    current = (BASE / 'current').resolve(strict=True)
    if not current.is_relative_to(RELEASES.resolve()) or not current.is_dir():
        raise ValueError('Current release is outside the managed releases directory')
    configured = health().get('configured')
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + sha[:12] + '-' + uuid4().hex[:6]
    target = RELEASES / stamp
    target.mkdir(mode=0o755)
    unpack(archive, target)
    # A syntax check does not execute application code as root.
    run('/usr/bin/node', '--check', str(target / 'server/index.mjs'))
    backup = backup_database(stamp)
    (target / 'release.json').write_text(json.dumps({'commit': sha, 'previous': str(current),
                                                   'databaseBackup': str(backup)}))
    switched = False
    try:
        switch_to(target)
        switched = True
        run('/usr/bin/systemctl', 'restart', 'eduethos')
        wait_healthy(target, configured)
    except BaseException:
        if switched:
            switch_to(current)
            run('/usr/bin/systemctl', 'restart', 'eduethos')
            wait_healthy(current, configured)
            print('Deployment failed; previous application version restored.', flush=True)
        # Never restore the database automatically: that could erase new records.
        raise
    print(json.dumps({'deployed': sha, 'release': str(target), 'databaseBackup': str(backup),
                      'health': 'passed'}), flush=True)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise ValueError('Run the installed receiver through its dedicated SSH key')
    os.umask(0o022)
    def expired(*_):
        raise DeploymentDeadlineExceeded('Deployment operation exceeded its time limit')

    signal.signal(signal.SIGALRM, expired)
    # Receive with a deadline before taking the lock, so a stalled sender cannot
    # hold up other complete requests. No production state has changed yet.
    signal.alarm(120)
    line = sys.stdin.buffer.readline(4097)
    if len(line) > 4096 or not line.endswith(b'\n'):
        raise ValueError('Invalid deployment header')
    request = json.loads(line)
    sha = request.get('commit', '')
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Expected a full Git commit SHA')
    size = request.get('archiveBytes')
    if type(size) is not int or not 0 < size <= MAX_ARCHIVE:
        raise ValueError('Invalid compressed package size')
    with tempfile.TemporaryFile() as archive:
        received = 0
        while received < size:
            chunk = sys.stdin.buffer.read(min(65536, size - received))
            if not chunk:
                raise ValueError('Deployment package is incomplete')
            received += len(chunk)
            archive.write(chunk)
        archive.seek(0)
        signal.alarm(0)
        lock_and_deploy(archive, sha)


def lock_and_deploy(archive, sha):
    with open('/run/lock/eduethos-deploy.lock', 'a') as lock:
        # Serialize even clients outside the GitHub concurrency group.
        deadline = time.monotonic() + 120
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise RuntimeError('Another deployment is still running')
                time.sleep(1)
        signal.alarm(300)
        try:
            deploy(archive, sha)
        finally:
            signal.alarm(0)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not emit environment data, cookies or secret configuration.
        print('Deployment error: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
