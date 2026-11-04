import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const EMPTY_STATE = { sessions: [], docs: [], activeSessionId: '' };

function publicUser(row) {
  return row ? { id: row.id, username: row.username, displayName: row.display_name, role: row.role } : null;
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function openStore(path, { now = () => Date.now() } = {}) {
  // Keep the SQLite constructor compatible with Node 22 LTS; busy_timeout is
  // configured through SQL instead of the newer constructor option.
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(class_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships(user_id);
    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const statements = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    adminCount: db.prepare("SELECT count(*) AS count FROM users WHERE role = 'admin'"),
    createUser: db.prepare('INSERT INTO users(id, username, display_name, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    createClass: db.prepare('INSERT INTO classes(id, name, created_at) VALUES (?, ?, ?)'),
    classById: db.prepare('SELECT id, name FROM classes WHERE id = ?'),
    membership: db.prepare('INSERT INTO memberships(class_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(class_id, user_id) DO NOTHING'),
    deleteMembership: db.prepare('DELETE FROM memberships WHERE class_id = ? AND user_id = ?'),
    membershipsExist: db.prepare('SELECT c.id AS class_id, c.name AS class_name, u.id AS user_id, u.username, u.role FROM memberships m JOIN classes c ON c.id = m.class_id JOIN users u ON u.id = m.user_id WHERE m.class_id = ? AND m.user_id = ?'),
    users: db.prepare('SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at, username'),
    classes: db.prepare('SELECT id, name FROM classes ORDER BY name'),
    memberships: db.prepare('SELECT class_id AS classId, user_id AS userId FROM memberships ORDER BY class_id, user_id'),
    createSession: db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    sessionUser: db.prepare('SELECT u.id, u.username, u.display_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    clearExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    state: db.prepare('SELECT revision, state_json FROM user_states WHERE user_id = ?'),
    insertState: db.prepare('INSERT INTO user_states(user_id, revision, state_json, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING'),
    updateState: db.prepare('UPDATE user_states SET revision = revision + 1, state_json = ?, updated_at = ? WHERE user_id = ? AND revision = ?'),
    teacherClasses: db.prepare("SELECT c.id, c.name FROM memberships mt JOIN classes c ON c.id = mt.class_id WHERE mt.user_id = ? ORDER BY c.name"),
    teacherStudentIds: db.prepare("SELECT DISTINCT u.id AS user_id FROM memberships mt JOIN memberships ms ON ms.class_id = mt.class_id JOIN users u ON u.id = ms.user_id WHERE mt.user_id = ? AND u.role = 'student' ORDER BY u.id"),
  };

  const publicUserById = id => publicUser(statements.userById.get(id));

  return {
    db,
    now,
    publicUser: publicUserById,
    getUserByUsername: username => {
      const row = statements.userByName.get(username);
      return row ? { ...publicUser(row), passwordSalt: row.password_salt, passwordHash: row.password_hash } : null;
    },
    userCount: () => db.prepare('SELECT count(*) AS count FROM users').get().count,
    adminCount: () => statements.adminCount.get().count,
    createUser({ id, username, displayName, role, passwordSalt, passwordHash }) {
      statements.createUser.run(id, username, displayName, role, passwordSalt, passwordHash, now());
      return publicUserById(id);
    },
    createClass({ id, name }) {
      statements.createClass.run(id, name, now());
      return statements.classById.get(id);
    },
    setMembership({ classId, userId }) {
      const membership = statements.membershipsExist.get(classId, userId);
      if (!membership) {
        const cls = statements.classById.get(classId);
        const user = statements.userById.get(userId);
        if (!cls || !user || !['student', 'teacher'].includes(user.role)) return null;
        statements.membership.run(classId, userId, now());
        return { classId, className: cls.name, userId: user.id, username: user.username, role: user.role };
      }
      return { classId: membership.class_id, className: membership.class_name, userId: membership.user_id, username: membership.username, role: membership.role };
    },
    removeMembership: ({ classId, userId }) => statements.deleteMembership.run(classId, userId).changes > 0,
    overview() {
      return {
        users: statements.users.all().map(publicUser),
        classes: statements.classes.all(),
        memberships: statements.memberships.all(),
      };
    },
    createSession({ token, userId, expiresAt }) {
      const tokenHash = hashSessionToken(token);
      statements.createSession.run(tokenHash, userId, expiresAt, now());
      return tokenHash;
    },
    revokeSession: token => statements.deleteSession.run(hashSessionToken(token)).changes > 0,
    getUserForToken(token) {
      if (typeof token !== 'string' || !token || token.length > 256) return null;
      const time = now();
      statements.clearExpired.run(time);
      return publicUser(statements.sessionUser.get(hashSessionToken(token), time));
    },
    getState(userId) {
      const row = statements.state.get(userId);
      return row ? { userId, revision: row.revision, state: JSON.parse(row.state_json) } : { userId, revision: 0, state: structuredClone(EMPTY_STATE) };
    },
    putState({ userId, expectedRevision, state }) {
      const serialized = JSON.stringify(state);
      if (expectedRevision === 0) {
        const inserted = statements.insertState.run(userId, serialized, now());
        if (inserted.changes !== 1) return null;
      } else {
        const result = statements.updateState.run(serialized, now(), userId, expectedRevision);
        if (result.changes !== 1) return null;
      }
      const current = statements.state.get(userId);
      if (!current || current.revision !== expectedRevision + 1) return null;
      return { userId, revision: current.revision };
    },
    teacherQuestions(userId) {
      const classes = statements.teacherClasses.all(userId);
      const studentIds = statements.teacherStudentIds.all(userId).map(row => row.user_id);
      const sessions = [];
      const getState = statements.state;
      for (const studentId of studentIds) {
        const row = getState.get(studentId);
        if (!row) continue;
        const state = JSON.parse(row.state_json);
        for (const session of state.sessions) {
          const messages = session.messages.filter(message => message.authorRole === 'student' && message.isDemo !== true).map(message => ({
            id: message.id,
            question: message.question,
            createdAt: message.createdAt || '',
            authorRole: 'student',
            isDemo: false,
            answer: { supported: message.answer?.supported === true },
            feedback: message.feedback === 'helpful' || message.feedback === 'unclear' ? message.feedback : '',
          }));
          if (messages.length) sessions.push({ id: session.id, chapterId: 'memory', messages });
        }
      }
      return { sessions, classes };
    },
    close() { db.close(); },
  };
}
