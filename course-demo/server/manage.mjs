#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { openStore } from './store.mjs';

const scrypt = promisify(scryptCallback);
const ownPath = fileURLToPath(import.meta.url);

function usage() {
  process.stdout.write(`账号与班级管理（不会在命令行参数中接收密码）

  node server/manage.mjs bootstrap-admin <username> <displayName>
  node server/manage.mjs create-user <username> <student|teacher|admin> <displayName>
  node server/manage.mjs create-class <name>
  node server/manage.mjs assign <classId> <userId>
  node server/manage.mjs list

数据库路径优先读取 DATABASE_PATH；也可用 DATA_DIR 指定目录。默认数据库为项目目录下的 runtime/eduethos.sqlite。
`);
}

async function readHiddenSecret(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('为避免密码回显，需在交互式终端中运行此命令。');
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolvePromise, reject) => {
    let value = '';
    const decoder = new StringDecoder('utf8');
    const finish = (error, result) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolvePromise(result);
    };
    const onData = data => {
      for (const byte of data) {
        if (byte === 3) return finish(new Error('操作已取消。'));
        if (byte === 13 || byte === 10) { value += decoder.end(); return finish(null, value); }
        if (byte === 8 || byte === 127) {
          if (value.length) { value = [...value].slice(0, -1).join(''); process.stdout.write('\b \b'); }
        } else if (byte >= 32 && byte !== 127) {
          const decoded = decoder.write(Buffer.from([byte]));
          if (decoded) { value += decoded; process.stdout.write('*'.repeat([...decoded].length)); }
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function addUser(store, usernameInput, role, displayNameInput) {
  const username = usernameInput?.trim().toLowerCase();
  const displayName = displayNameInput?.trim();
  if (!/^[a-z0-9_-]{3,40}$/.test(username || '')) throw new Error('账号只能包含小写字母、数字、下划线和连字符，长度为3至40位。');
  if (!['admin', 'teacher', 'student'].includes(role)) throw new Error('角色应为 student、teacher 或 admin。');
  if (!displayName || displayName.length > 40) throw new Error('显示名称不能为空且最多40个字符。');
  const password = await readHiddenSecret('输入新密码（至少12位）：');
  if ([...password].length < 12 || [...password].length > 128) throw new Error('密码长度必须是12至128个字符。');
  const confirmation = await readHiddenSecret('再次输入密码：');
  if (password !== confirmation) throw new Error('两次输入的密码不一致。');
  const salt = randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const user = store.createUser({ id: randomUUID(), username, displayName, role,
    passwordSalt: salt.toString('base64url'), passwordHash: passwordHash.toString('base64url') });
  process.stdout.write(`已创建 ${user.role} 账号 ${user.username}（${user.id}）。\n`);
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...params] = args;
  if (!command || command === '--help' || command === '-h') { usage(); return; }
  if (command === 'create-class' && (!params[0] || params[0].length > 100)) throw new Error('班级名称不能为空且最多100个字符。');
  if (command === 'assign' && (!params[0] || !params[1])) throw new Error('用法：assign <classId> <userId>。');
  if (['bootstrap-admin', 'create-user'].includes(command) && params.length < (command === 'bootstrap-admin' ? 2 : 3)) throw new Error('用法不正确；参见 --help。');
  if (!['bootstrap-admin', 'create-user', 'create-class', 'assign', 'list'].includes(command)) throw new Error('未知命令；参见 --help。');

  const defaultDataDirectory = resolve(dirname(ownPath), '..', 'runtime');
  const databasePath = resolve(process.env.DATABASE_PATH || resolve(process.env.DATA_DIR || defaultDataDirectory, 'eduethos.sqlite'));
  await mkdir(dirname(databasePath), { recursive: true });
  const store = openStore(databasePath);
  try {
    if (command === 'bootstrap-admin') {
      if (store.adminCount() !== 0) throw new Error('管理员账号已存在；如需新管理员，请由现有管理员创建。');
      await addUser(store, params[0], 'admin', params[1]);
      return;
    }
    if (command === 'create-user') {
      await addUser(store, params[0], params[1], params[2]);
      return;
    }
    if (command === 'create-class') {
      const cls = store.createClass({ id: randomUUID(), name: params[0].trim() });
      process.stdout.write(`已创建班级 ${cls.name}（${cls.id}）。\n`);
      return;
    }
    if (command === 'assign') {
      const membership = store.setMembership({ classId: params[0], userId: params[1] });
      if (!membership) throw new Error('班级或用户不存在。');
      process.stdout.write(`已将 ${membership.username}（${membership.role}）分配至 ${membership.className}。\n`);
      return;
    }
    const { users, classes, memberships } = store.overview();
    process.stdout.write(`${JSON.stringify({ users, classes, memberships }, null, 2)}\n`);
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`错误：${error.message}\n`);
    process.exitCode = 1;
  });
}
