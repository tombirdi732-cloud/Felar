import express, { Router } from 'express';
import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { join, extname } from 'path';
import db, { uploadsDir } from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authRequired,
} from './auth.js';
import { broadcastToServer, isOnline, sendToUser } from './hub.js';

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

// Update the current user's profile (currently: avatar URL).
router.patch('/me', authRequired, (req, res) => {
  if (req.body?.avatar !== undefined) {
    const url = req.body.avatar === null ? null : String(req.body.avatar).slice(0, 300);
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.user.id);
  }
  const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

/* ----------------------------- Uploads ----------------------------- */

const MAX_UPLOAD = 12 * 1024 * 1024; // 12 MB
const rawUpload = express.raw({ type: () => true, limit: MAX_UPLOAD });

function safeExt(name, type) {
  let ext = extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  if (!ext) {
    const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
    ext = map[type] || '';
  }
  return ext;
}

// Upload a file (raw body). Returns a URL usable as an attachment or avatar.
router.post('/upload', authRequired, rawUpload, (req, res) => {
  const buf = req.body;
  if (!buf || !buf.length) return res.status(400).json({ error: 'Пустой файл' });
  if (buf.length > MAX_UPLOAD) return res.status(413).json({ error: 'Файл слишком большой (макс. 12 МБ)' });

  const name = String(req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'file').slice(0, 200);
  const type = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100);
  const fname = crypto.randomBytes(16).toString('hex') + safeExt(name, type);
  writeFileSync(join(uploadsDir, fname), buf);
  res.json({ url: '/uploads/' + fname, name, type, size: buf.length });
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

  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.avatar, m.role FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE m.server_id = ?
       ORDER BY u.username`
    )
    .all(serverId);
  const members = rows.map((u) => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    role: server && u.id === server.owner_id ? 'owner' : (u.role || 'member'),
    online: isOnline(u.id),
  }));
  res.json({ members });
});

// Create a channel in a server.
router.post('/servers/:id/channels', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!canManage(getRole(req.user.id, serverId)))
    return res.status(403).json({ error: 'Недостаточно прав' });

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

/* ---------------------- Server management ---------------------- */

// Helper: load a server and assert the current user owns it.
function assertOwner(serverId, userId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return { error: 404 };
  if (server.owner_id !== userId) return { error: 403 };
  return { server };
}

// A user's role on a server: 'owner' | 'admin' | 'member' | null (not a member).
function getRole(userId, serverId) {
  const s = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!s) return null;
  if (s.owner_id === userId) return 'owner';
  const m = db.prepare('SELECT role FROM memberships WHERE user_id = ? AND server_id = ?').get(userId, serverId);
  return m ? (m.role || 'member') : null;
}
function canManage(role) { return role === 'owner' || role === 'admin'; }

// Assert the current user can manage (owner or admin) the given server.
function assertManage(serverId, userId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return { error: 404 };
  const role = getRole(userId, serverId);
  if (!canManage(role)) return { error: 403 };
  return { server, role };
}

// Rename a server (owner only).
router.patch('/servers/:id', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const { server, error } = assertOwner(serverId, req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сервер не найден' : 'Только владелец может изменять сервер' });

  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Название: от 2 до 40 символов' });

  db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name, serverId);
  broadcastToServer(serverId, { type: 'server_updated', server_id: serverId, name });
  res.json({ ok: true, name });
});

// Delete a server (owner only).
router.delete('/servers/:id', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const { error } = assertOwner(serverId, req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сервер не найден' : 'Только владелец может удалить сервер' });

  broadcastToServer(serverId, { type: 'server_deleted', server_id: serverId });
  db.prepare('DELETE FROM servers WHERE id = ?').run(serverId); // cascades channels/messages/memberships
  res.json({ ok: true });
});

// Leave a server (any member except the owner — the owner must delete it).
router.post('/servers/:id/leave', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (server.owner_id === req.user.id)
    return res.status(400).json({ error: 'Владелец не может выйти — удалите сервер' });

  db.prepare('DELETE FROM memberships WHERE user_id = ? AND server_id = ?').run(req.user.id, serverId);
  broadcastToServer(serverId, { type: 'member_left', server_id: serverId, user_id: req.user.id });
  res.json({ ok: true });
});

// Kick a member (owner only).
router.delete('/servers/:id/members/:userId', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const { role: actorRole, error } = assertManage(serverId, req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сервер не найден' : 'Недостаточно прав' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя исключить себя' });

  const targetRole = getRole(targetId, serverId);
  if (!targetRole) return res.status(404).json({ error: 'Участник не найден' });
  const rank = { owner: 3, admin: 2, member: 1 };
  if (rank[targetRole] >= rank[actorRole])
    return res.status(403).json({ error: 'Недостаточно прав для этого участника' });

  db.prepare('DELETE FROM memberships WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
  broadcastToServer(serverId, { type: 'member_left', server_id: serverId, user_id: targetId });
  sendToUser(targetId, { type: 'server_removed', server_id: serverId });
  res.json({ ok: true });
});

// Assign a role to a member (owner only): 'admin' or 'member'.
router.patch('/servers/:id/members/:userId/role', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const { error } = assertOwner(serverId, req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сервер не найден' : 'Только владелец назначает роли' });

  const role = String(req.body?.role || '');
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Некорректная роль' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя изменить свою роль' });

  const membership = db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?').get(targetId, serverId);
  if (!membership) return res.status(404).json({ error: 'Участник не найден' });

  db.prepare('UPDATE memberships SET role = ? WHERE user_id = ? AND server_id = ?').run(role, targetId, serverId);
  broadcastToServer(serverId, { type: 'member_role', server_id: serverId, user_id: targetId, role });
  res.json({ ok: true, role });
});

// Rename a channel (owner only).
router.patch('/channels/:id', authRequired, (req, res) => {
  const channelId = Number(req.params.id);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!canManage(getRole(req.user.id, channel.server_id)))
    return res.status(403).json({ error: 'Недостаточно прав' });

  let name = String(req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9а-яё_-]/g, '');
  if (name.length < 1 || name.length > 24) return res.status(400).json({ error: 'Некорректное имя канала' });

  db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, channelId);
  broadcastToServer(channel.server_id, { type: 'channel_updated', server_id: channel.server_id, channel: { id: channelId, name } });
  res.json({ ok: true, name });
});

// Delete a channel (owner only).
router.delete('/channels/:id', authRequired, (req, res) => {
  const channelId = Number(req.params.id);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!canManage(getRole(req.user.id, channel.server_id)))
    return res.status(403).json({ error: 'Недостаточно прав' });

  db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
  broadcastToServer(channel.server_id, { type: 'channel_deleted', server_id: channel.server_id, channel_id: channelId });
  res.json({ ok: true });
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
      `SELECT m.id, m.channel_id, m.content, m.created_at, m.edited_at, m.user_id,
              m.attachment_url, m.attachment_name, m.attachment_type, u.username, u.avatar
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
  if (message.user_id !== req.user.id && !canManage(getRole(req.user.id, message.server_id)))
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

/* ----------------------- Direct messages ----------------------- */

// Serialize a DM thread from the current user's point of view.
export function serializeThread(thread, meId) {
  const otherId = thread.user_lo === meId ? thread.user_hi : thread.user_lo;
  const other = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(otherId);
  const last = db
    .prepare('SELECT content, created_at FROM dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1')
    .get(thread.id);
  return {
    id: thread.id,
    other: other ? { ...other, online: isOnline(other.id) } : null,
    last_at: thread.last_at,
    preview: last ? last.content : '',
  };
}

// Both participant user ids of a thread the user belongs to (or null).
function threadParticipants(threadId, userId) {
  const t = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
  if (!t || (t.user_lo !== userId && t.user_hi !== userId)) return null;
  return { thread: t, other: t.user_lo === userId ? t.user_hi : t.user_lo };
}

// List the current user's DM threads (most recent first).
router.get('/dms', authRequired, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM dm_threads WHERE user_lo = ? OR user_hi = ? ORDER BY last_at DESC')
    .all(req.user.id, req.user.id);
  res.json({ threads: rows.map((t) => serializeThread(t, req.user.id)).filter((t) => t.other) });
});

// Get or create a DM thread with another user.
router.post('/dms', authRequired, (req, res) => {
  const otherId = Number(req.body?.user_id);
  if (!otherId || otherId === req.user.id) return res.status(400).json({ error: 'Некорректный пользователь' });
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'Пользователь не найден' });

  const lo = Math.min(req.user.id, otherId);
  const hi = Math.max(req.user.id, otherId);
  let thread = db.prepare('SELECT * FROM dm_threads WHERE user_lo = ? AND user_hi = ?').get(lo, hi);
  if (!thread) {
    const info = db
      .prepare('INSERT INTO dm_threads (user_lo, user_hi, created_at, last_at) VALUES (?, ?, ?, ?)')
      .run(lo, hi, now(), now());
    thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ thread: serializeThread(thread, req.user.id) });
});

// History for a DM thread (participant only).
router.get('/dms/:id/messages', authRequired, (req, res) => {
  const parts = threadParticipants(Number(req.params.id), req.user.id);
  if (!parts) return res.status(403).json({ error: 'Нет доступа' });

  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = db
    .prepare(
      `SELECT m.id, m.thread_id, m.content, m.created_at, m.user_id,
              m.attachment_url, m.attachment_name, m.attachment_type, u.username, u.avatar
       FROM dm_messages m JOIN users u ON u.id = m.user_id
       WHERE m.thread_id = ? AND m.id < ?
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(parts.thread.id, before, limit);
  res.json({ messages: rows.reverse() });
});

export default router;
