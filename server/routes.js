import { Router } from 'express';
import crypto from 'crypto';
import db from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authRequired,
} from './auth.js';
import { broadcastToServer, isOnline } from './hub.js';

const router = Router();
const now = () => Date.now();

function makeInviteCode() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

/* ----------------------------- Auth ----------------------------- */

router.post('/auth/register', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (username.length < 3 || username.length > 24)
    return res.status(400).json({ error: 'Имя: от 3 до 24 символов' });
  if (!/^[a-zA-Z0-9_а-яА-ЯёЁ ]+$/.test(username))
    return res.status(400).json({ error: 'Недопустимые символы в имени' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Пароль: минимум 6 символов' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Имя уже занято' });

  const info = db
    .prepare('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), now());

  const user = { id: info.lastInsertRowid, username, avatar: null };
  res.json({ token: signToken(user), user });
});

router.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password))
    return res.status(401).json({ error: 'Неверное имя или пароль' });

  const user = { id: row.id, username: row.username, avatar: row.avatar };
  res.json({ token: signToken(user), user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

/* ---------------------------- Servers --------------------------- */

// Serialize a server with its channels for the client.
function serializeServer(serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return null;
  const channels = db
    .prepare('SELECT id, name, position FROM channels WHERE server_id = ? ORDER BY position, id')
    .all(serverId);
  return {
    id: server.id,
    name: server.name,
    owner_id: server.owner_id,
    invite_code: server.invite_code,
    channels,
  };
}

// All servers the current user belongs to.
router.get('/servers', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id FROM servers s
       JOIN memberships m ON m.server_id = s.id
       WHERE m.user_id = ?
       ORDER BY m.joined_at`
    )
    .all(req.user.id);
  res.json({ servers: rows.map((r) => serializeServer(r.id)) });
});

// Create a server (+ a default #general channel, owner becomes member).
router.post('/servers', authRequired, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 40)
    return res.status(400).json({ error: 'Название: от 2 до 40 символов' });

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO servers (name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?)')
      .run(name, req.user.id, makeInviteCode(), now());
    const serverId = info.lastInsertRowid;
    db.prepare('INSERT INTO channels (server_id, name, position, created_at) VALUES (?, ?, ?, ?)')
      .run(serverId, 'general', 0, now());
    db.prepare('INSERT INTO memberships (user_id, server_id, joined_at) VALUES (?, ?, ?)')
      .run(req.user.id, serverId, now());
    return serverId;
  });

  res.json({ server: serializeServer(tx()) });
});

// Join a server by invite code.
router.post('/servers/join', authRequired, (req, res) => {
  const code = String(req.body?.invite_code || '').trim().toLowerCase();
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!server) return res.status(404).json({ error: 'Приглашение не найдено' });

  const already = db
    .prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?')
    .get(req.user.id, server.id);
  if (!already) {
    db.prepare('INSERT INTO memberships (user_id, server_id, joined_at) VALUES (?, ?, ?)')
      .run(req.user.id, server.id, now());
    broadcastToServer(server.id, {
      type: 'member_joined',
      server_id: server.id,
      user: req.user,
    }, { exceptUserId: req.user.id });
  }
  res.json({ server: serializeServer(server.id) });
});

// Helper: assert current user is a member of the server owning `serverId`.
function assertMember(userId, serverId) {
  return db
    .prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?')
    .get(userId, serverId);
}

// Members of a server with online status.
router.get('/servers/:id/members', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  if (!assertMember(req.user.id, serverId))
    return res.status(403).json({ error: 'Нет доступа' });

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.avatar FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE m.server_id = ?
       ORDER BY u.username`
    )
    .all(serverId);
  const members = rows.map((u) => ({ ...u, online: isOnline(u.id) }));
  res.json({ members });
});

// Create a channel in a server.
router.post('/servers/:id/channels', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (server.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Только владелец может создавать каналы' });

  let name = String(req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  name = name.replace(/[^a-z0-9а-яё_-]/g, '');
  if (name.length < 1 || name.length > 24)
    return res.status(400).json({ error: 'Некорректное имя канала' });

  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS p FROM channels WHERE server_id = ?')
    .get(serverId).p;
  const info = db
    .prepare('INSERT INTO channels (server_id, name, position, created_at) VALUES (?, ?, ?, ?)')
    .run(serverId, name, maxPos + 1, now());

  const channel = { id: info.lastInsertRowid, name, position: maxPos + 1 };
  broadcastToServer(serverId, { type: 'channel_created', server_id: serverId, channel });
  res.json({ channel });
});

/* --------------------------- Messages --------------------------- */

// Aggregate reactions for a set of message ids -> { messageId: [{emoji,count,users}] }
export function reactionsFor(messageIds) {
  const map = {};
  if (!messageIds.length) return map;
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${placeholders})`)
    .all(...messageIds);
  for (const r of rows) {
    (map[r.message_id] ||= {});
    (map[r.message_id][r.emoji] ||= { emoji: r.emoji, count: 0, users: [] });
    map[r.message_id][r.emoji].count++;
    map[r.message_id][r.emoji].users.push(r.user_id);
  }
  const out = {};
  for (const id of messageIds) out[id] = Object.values(map[id] || {});
  return out;
}

// Message history for a channel (paginated backwards via `before` id).
router.get('/channels/:id/messages', authRequired, (req, res) => {
  const channelId = Number(req.params.id);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!assertMember(req.user.id, channel.server_id))
    return res.status(403).json({ error: 'Нет доступа' });

  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const rows = db
    .prepare(
      `SELECT m.id, m.channel_id, m.content, m.created_at, m.edited_at, m.user_id, u.username, u.avatar
       FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = ? AND m.id < ?
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(channelId, before, limit);

  const reacts = reactionsFor(rows.map((r) => r.id));
  for (const r of rows) r.reactions = reacts[r.id] || [];

  res.json({ messages: rows.reverse() });
});

// Load a message together with its channel & server, checking membership.
function loadMessageForUser(messageId, userId) {
  const m = db
    .prepare(
      `SELECT m.*, c.server_id, s.owner_id
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       JOIN servers s ON s.id = c.server_id
       WHERE m.id = ?`
    )
    .get(messageId);
  if (!m) return { error: 404 };
  if (!assertMember(userId, m.server_id)) return { error: 403 };
  return { message: m };
}

// Edit a message (author only).
router.patch('/messages/:id', authRequired, (req, res) => {
  const { message, error } = loadMessageForUser(Number(req.params.id), req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сообщение не найдено' : 'Нет доступа' });
  if (message.user_id !== req.user.id)
    return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });

  const content = String(req.body?.content || '').trim();
  if (!content || content.length > 2000) return res.status(400).json({ error: 'Некорректный текст' });

  const ts = now();
  db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(content, ts, message.id);
  broadcastToServer(message.server_id, {
    type: 'message_updated',
    message: { id: message.id, channel_id: message.channel_id, content, edited_at: ts },
  });
  res.json({ ok: true });
});

// Delete a message (author or server owner).
router.delete('/messages/:id', authRequired, (req, res) => {
  const { message, error } = loadMessageForUser(Number(req.params.id), req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сообщение не найдено' : 'Нет доступа' });
  if (message.user_id !== req.user.id && message.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Нет прав на удаление' });

  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  broadcastToServer(message.server_id, {
    type: 'message_deleted',
    message_id: message.id,
    channel_id: message.channel_id,
  });
  res.json({ ok: true });
});

// Toggle the current user's reaction (emoji) on a message.
router.post('/messages/:id/react', authRequired, (req, res) => {
  const { message, error } = loadMessageForUser(Number(req.params.id), req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сообщение не найдено' : 'Нет доступа' });

  const emoji = String(req.body?.emoji || '').trim().slice(0, 8);
  if (!emoji) return res.status(400).json({ error: 'Нет эмодзи' });

  const existing = db
    .prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(message.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(message.id, req.user.id, emoji);
  } else {
    db.prepare('INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
      .run(message.id, req.user.id, emoji, now());
  }

  const reactions = reactionsFor([message.id])[message.id] || [];
  broadcastToServer(message.server_id, {
    type: 'reaction_updated',
    message_id: message.id,
    channel_id: message.channel_id,
    reactions,
  });
  res.json({ reactions });
});

export default router;
