"""Exercise archive restrictions, SQLite backup and code rollback without production access."""
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1] / 'deploy/github-deploy.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


def package(extra=()):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as archive:
        entries = [(f'course-demo/{name}', b'[]' if name.endswith('documents.json') else b'// fixture')
                   for name in receiver.REQUIRED]
        entries = [(name, b'[{"id":"test"}]' if name.endswith('documents.json') else data) for name, data in entries]
        for name, data in entries + list(extra):
            member = tarfile.TarInfo(name)
            if data is None:
                member.type = tarfile.SYMTYPE
                member.linkname = '/etc/eduethos/eduethos.env'
                archive.addfile(member)
            else:
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
    stream.seek(0)
    return stream


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='eduethos-deploy-test-')
        self.root = Path(self.scratch.name)

    def tearDown(self):
        self.scratch.cleanup()

    def test_safe_package(self):
        target = self.root / 'release'
        target.mkdir()
        receiver.unpack(package(), target)
        self.assertTrue((target / 'server/index.mjs').is_file())
        self.assertFalse((target / 'deploy').exists())

    def test_rejects_escape_links_private_and_duplicate_files(self):
        for name, value in [
            ('course-demo/../../outside.js', b'bad'),
            ('/course-demo/server/absolute.mjs', b'bad'),
            ('course-demo/server/link.mjs', None),
            ('course-demo/.env', b'secret'),
            ('course-demo/deploy/install.sh', b'bad'),
            ('course-demo/server/data.sqlite', b'bad'),
            ('course-demo/server/.hidden.mjs', b'bad'),
            ('course-demo/server/index.mjs', b'duplicate'),
        ]:
            with self.subTest(name=name), tempfile.TemporaryDirectory(dir=self.root) as folder:
                with self.assertRaises(ValueError):
                    receiver.unpack(package([(name, value)]), Path(folder))
        self.assertFalse((self.root / 'outside.js').exists())

    def test_rejects_oversized_and_incomplete_packages(self):
        with patch.object(receiver, 'MAX_FILE', 4):
            with self.assertRaises(ValueError):
                receiver.unpack(package(), self.root)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz'):
            pass
        stream.seek(0)
        with self.assertRaises(ValueError):
            receiver.unpack(stream, self.root)

    def test_backup_captures_committed_wal_data_without_modifying_source(self):
        source_path = self.root / 'live.sqlite'
        with sqlite3.connect(source_path) as live:
            live.execute('PRAGMA journal_mode=WAL')
            live.execute('CREATE TABLE records (value TEXT)')
            live.execute("INSERT INTO records VALUES ('keep-me')")
            live.commit()
            with patch.object(receiver, 'DATABASE', source_path), patch.object(receiver, 'BACKUPS', self.root / 'backups'):
                backup = receiver.backup_database('fixture')
            with sqlite3.connect(backup) as copy:
                self.assertEqual(copy.execute('SELECT value FROM records').fetchall(), [('keep-me',)])
            self.assertEqual(live.execute('SELECT count(*) FROM records').fetchone()[0], 1)
        self.assertFalse((self.root / 'live.sqlite?mode=ro').exists())

    def deployment_fixture(self, healthy):
        base = self.root / 'app'
        releases = base / 'releases'
        old = releases / 'old'
        old.mkdir(parents=True)
        (base / 'current').symlink_to(old, target_is_directory=True)
        validations = []

        def validate(target, configured):
            validations.append(target)
            self.assertTrue(configured)
            self.assertEqual((base / 'current').resolve(), target)
            if target != old and not healthy:
                raise RuntimeError('simulated health failure')

        with patch.object(receiver, 'BASE', base), patch.object(receiver, 'RELEASES', releases), \
             patch.object(receiver, 'health', return_value={'configured': True}), \
             patch.object(receiver, 'run', return_value=''), \
             patch.object(receiver, 'backup_database', return_value=self.root / 'backup.sqlite'), \
             patch.object(receiver, 'wait_healthy', side_effect=validate):
            if healthy:
                receiver.deploy(package(), 'a' * 40)
                target = (base / 'current').resolve()
                self.assertNotEqual(target, old)
                self.assertEqual(json.loads((target / 'release.json').read_text())['commit'], 'a' * 40)
            else:
                with self.assertRaisesRegex(RuntimeError, 'simulated health failure'):
                    receiver.deploy(package(), 'a' * 40)
                self.assertEqual((base / 'current').resolve(), old)
                self.assertEqual(validations[-1], old)

    def test_success_switches_to_new_release(self):
        self.deployment_fixture(healthy=True)

    def test_failed_health_restores_previous_release(self):
        self.deployment_fixture(healthy=False)

    def test_deadline_is_not_swallowed_by_health_retries(self):
        with patch.object(receiver, 'health', side_effect=receiver.DeploymentDeadlineExceeded('deadline')):
            with self.assertRaises(receiver.DeploymentDeadlineExceeded):
                receiver.wait_healthy(self.root, True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
