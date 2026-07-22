import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB location is configurable so it can live on a mounted volume in Docker.
// ROOST_DB may be absolute or relative to the project root.
const rawPath = process.env.ROOST_DB || 'roost.db';
const dbPath = isAbsolute(rawPath) ? rawPath : join(__dirname, '..', rawPath);
mkdirSync(dirname(dbPath), { recursive: true });

// Uploaded files live next to the DB (same Docker volume) so they persist.
export const uploadsDir = process.env.ROOST_UPLOADS || join(dirname(dbPath), 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    avatar     TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT    NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memberships (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'member',
    PRIMARY KEY (user_id, server_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    attachment_url  TEXT,
    attachment_name TEXT,
    attachment_type TEXT
  );

  CREATE TABLE IF NOT EXISTS reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  -- Direct-message threads between two users (user_lo < user_hi).
  CREATE TABLE IF NOT EXISTS dm_threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_lo    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_hi    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_at    INTEGER NOT NULL,
    UNIQUE (user_lo, user_hi)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id  INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    attachment_url  TEXT,
    attachment_name TEXT,
    attachment_type TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_channels_server  ON channels(server_id);
  CREATE INDEX IF NOT EXISTS idx_members_server    ON memberships(server_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_msg     ON reactions(message_id);
  CREATE INDEX IF NOT EXISTS idx_dm_threads_lo     ON dm_threads(user_lo);
  CREATE INDEX IF NOT EXISTS idx_dm_threads_hi     ON dm_threads(user_hi);
  CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, id);
`);

// --- lightweight migrations for databases created before these columns ---
function ensureColumn(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
ensureColumn('messages', 'edited_at', 'INTEGER');
ensureColumn('messages', 'attachment_url', 'TEXT');
ensureColumn('messages', 'attachment_name', 'TEXT');
ensureColumn('messages', 'attachment_type', 'TEXT');
ensureColumn('dm_messages', 'attachment_url', 'TEXT');
ensureColumn('dm_messages', 'attachment_name', 'TEXT');
ensureColumn('dm_messages', 'attachment_type', 'TEXT');
ensureColumn('users', 'avatar', 'TEXT');
ensureColumn('memberships', 'role', "TEXT NOT NULL DEFAULT 'member'");

export default db;
