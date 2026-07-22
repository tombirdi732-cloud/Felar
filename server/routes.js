import express, { Router } from 'express';
import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { join, extname } from 'path';
import db, { uploadsDir } from './db.js';
import { PERM, ALL_PERMS } from './perms.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authRequired,
  adminRequired,
} from './auth.js';
import { broadcastToServer, isOnline, sendToUser } from './hub.js';
import {
  memberPermissions,
  hasPerm,
  highestPosition,
  canViewChannel,
  channelViewers,
  channelRoleIds,
  broadcastToChannel,
} from './access.js';

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

  // The very first registered user becomes the site administrator.
  const isFirst = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  const info = db
    .prepare('INSERT INTO users (username, password, created_at, is_admin) VALUES (?, ?, ?, ?)')
    .run(username, hashPassword(password), now(), isFirst ? 1 : 0);

  const user = { id: info.lastInsertRowid, username, avatar: null, is_admin: isFirst };
  res.json({ token: signToken(user), user });
});

router.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password))
    return res.status(401).json({ error: 'Неверное имя или пароль' });
  if (row.is_banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });

  const user = { id: row.id, username: row.username, avatar: row.avatar, is_admin: !!row.is_admin };
  res.json({ token: signToken(user), user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// WebRTC ICE configuration for calls (public STUN + optional TURN via env).
router.get('/rtc-config', authRequired, (req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.ROOST_TURN_URL) {
    iceServers.push({
      urls: process.env.ROOST_TURN_URL,
      username: process.env.ROOST_TURN_USERNAME || undefined,
      credential: process.env.ROOST_TURN_CREDENTIAL || undefined,
    });
  }
  res.json({ iceServers });
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

// Serialize a server with the channels the given user is allowed to see.
function serializeServer(serverId, userId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return null;
  const rows = db
    .prepare('SELECT id, name, position, topic, is_private, server_id FROM channels WHERE server_id = ? ORDER BY position, id')
    .all(serverId);
  const channels = rows
    .filter((c) => canViewChannel(userId, c))
    .map((c) => ({
      id: c.id, name: c.name, position: c.position, topic: c.topic,
      is_private: !!c.is_private, role_ids: c.is_private ? channelRoleIds(c.id) : [],
    }));
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
  res.json({ servers: rows.map((r) => serializeServer(r.id, req.user.id)) });
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
    db.prepare("INSERT INTO roles (server_id, name, color, position, permissions, is_default, created_at) VALUES (?, '@everyone', NULL, 0, 0, 1, ?)")
      .run(serverId, now());
    return serverId;
  });

  res.json({ server: serializeServer(tx(), req.user.id) });
});

// Join a server by invite code.
router.post('/servers/join', authRequired, (req, res) => {
  const code = String(req.body?.invite_code || '').trim().toLowerCase();
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!server) return res.status(404).json({ error: 'Приглашение не найдено' });

  if (db.prepare('SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?').get(server.id, req.user.id))
    return res.status(403).json({ error: 'Ты забанен на этом сервере' });

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
  res.json({ server: serializeServer(server.id, req.user.id) });
});

// Helper: assert current user is a member of the server owning `serverId`.
function assertMember(userId, serverId) {
  return db
    .prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?')
    .get(userId, serverId);
}

// One server serialized for the current user (used to refresh channel lists).
router.get('/servers/:id', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  if (!assertMember(req.user.id, serverId)) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ server: serializeServer(serverId, req.user.id) });
});

// Members of a server with online status.
router.get('/servers/:id/members', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  if (!assertMember(req.user.id, serverId))
    return res.status(403).json({ error: 'Нет доступа' });

  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.avatar FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE m.server_id = ?
       ORDER BY u.username`
    )
    .all(serverId);
  const roleRows = db
    .prepare(
      `SELECT mr.user_id, r.id, r.name, r.color, r.position FROM member_roles mr
       JOIN roles r ON r.id = mr.role_id WHERE r.server_id = ?`
    )
    .all(serverId);
  const byUser = {};
  for (const rr of roleRows) (byUser[rr.user_id] ||= []).push(rr);

  const members = rows.map((u) => {
    const roles = (byUser[u.id] || []).sort((a, b) => b.position - a.position);
    const isOwner = server && u.id === server.owner_id;
    const top = isOwner
      ? { name: 'Владелец', color: '#e8a23a' }
      : (roles[0] ? { name: roles[0].name, color: roles[0].color } : null);
    return {
      id: u.id, username: u.username, avatar: u.avatar, online: isOnline(u.id),
      owner: !!isOwner, role_ids: roles.map((r) => r.id), top,
    };
  });

  const meOwner = !!(server && server.owner_id === req.user.id);
  res.json({
    members,
    me: {
      owner: meOwner,
      permissions: memberPermissions(req.user.id, serverId),
      position: meOwner ? Number.MAX_SAFE_INTEGER : highestPosition(req.user.id, serverId),
    },
  });
});

// Create a channel in a server.
router.post('/servers/:id/channels', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!hasPerm(req.user.id, serverId, PERM.MANAGE_CHANNELS))
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

  const channel = { id: info.lastInsertRowid, name, position: maxPos + 1, topic: null, is_private: false, role_ids: [] };
  broadcastToServer(serverId, { type: 'server_channels', server_id: serverId });
  res.json({ channel });
});

/* ---------------------- Server management ---------------------- */

// Rename a server (MANAGE_SERVER).
router.patch('/servers/:id', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!hasPerm(req.user.id, serverId, PERM.MANAGE_SERVER))
    return res.status(403).json({ error: 'Недостаточно прав' });

  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Название: от 2 до 40 символов' });

  db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name, serverId);
  broadcastToServer(serverId, { type: 'server_updated', server_id: serverId, name });
  res.json({ ok: true, name });
});

// Delete a server (owner only).
router.delete('/servers/:id', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (server.owner_id !== req.user.id) return res.status(403).json({ error: 'Только владелец может удалить сервер' });

  broadcastToServer(serverId, { type: 'server_deleted', server_id: serverId });
  db.prepare('DELETE FROM servers WHERE id = ?').run(serverId); // cascades channels/messages/memberships/roles
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
  db.prepare('DELETE FROM member_roles WHERE user_id = ? AND server_id = ?').run(req.user.id, serverId);
  broadcastToServer(serverId, { type: 'member_left', server_id: serverId, user_id: req.user.id });
  res.json({ ok: true });
});

// Kick a member (KICK_MEMBERS + role hierarchy).
router.delete('/servers/:id/members/:userId', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!hasPerm(req.user.id, serverId, PERM.KICK_MEMBERS)) return res.status(403).json({ error: 'Недостаточно прав' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя исключить себя' });
  if (server.owner_id === targetId) return res.status(403).json({ error: 'Нельзя исключить владельца' });

  const membership = db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?').get(targetId, serverId);
  if (!membership) return res.status(404).json({ error: 'Участник не найден' });
  if (highestPosition(req.user.id, serverId) <= highestPosition(targetId, serverId))
    return res.status(403).json({ error: 'Недостаточно прав для этого участника' });

  db.prepare('DELETE FROM memberships WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
  db.prepare('DELETE FROM member_roles WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
  broadcastToServer(serverId, { type: 'member_left', server_id: serverId, user_id: targetId });
  sendToUser(targetId, { type: 'server_removed', server_id: serverId });
  res.json({ ok: true });
});

/* ---------------------- Server bans ---------------------- */

// List a server's bans (BAN_MEMBERS).
router.get('/servers/:id/bans', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  if (!hasPerm(req.user.id, serverId, PERM.BAN_MEMBERS)) return res.status(403).json({ error: 'Недостаточно прав' });
  const rows = db
    .prepare(
      `SELECT b.user_id, b.reason, b.created_at, u.username, u.avatar
       FROM bans b JOIN users u ON u.id = b.user_id
       WHERE b.server_id = ? ORDER BY b.created_at DESC`
    )
    .all(serverId);
  res.json({ bans: rows });
});

// Ban a member (BAN_MEMBERS + hierarchy). Removes them and blocks rejoin.
router.post('/servers/:id/bans', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.body?.user_id);
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!hasPerm(req.user.id, serverId, PERM.BAN_MEMBERS)) return res.status(403).json({ error: 'Недостаточно прав' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя забанить себя' });
  if (server.owner_id === targetId) return res.status(403).json({ error: 'Нельзя забанить владельца' });
  if (highestPosition(req.user.id, serverId) <= highestPosition(targetId, serverId))
    return res.status(403).json({ error: 'Недостаточно прав для этого участника' });

  const reason = String(req.body?.reason || '').slice(0, 200);
  db.prepare('INSERT OR REPLACE INTO bans (server_id, user_id, banned_by, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(serverId, targetId, req.user.id, reason, now());
  db.prepare('DELETE FROM memberships WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
  db.prepare('DELETE FROM member_roles WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
  broadcastToServer(serverId, { type: 'member_left', server_id: serverId, user_id: targetId });
  sendToUser(targetId, { type: 'server_removed', server_id: serverId });
  res.json({ ok: true });
});

// Unban (BAN_MEMBERS).
router.delete('/servers/:id/bans/:userId', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  if (!hasPerm(req.user.id, serverId, PERM.BAN_MEMBERS)) return res.status(403).json({ error: 'Недостаточно прав' });
  db.prepare('DELETE FROM bans WHERE server_id = ? AND user_id = ?').run(serverId, targetId);
  res.json({ ok: true });
});

/* ---------------------- Site administration ---------------------- */

// List all users (admin only).
router.get('/admin/users', authRequired, adminRequired, (req, res) => {
  const users = db.prepare('SELECT id, username, avatar, is_banned, is_admin, created_at FROM users ORDER BY id').all();
  res.json({ users: users.map((u) => ({ ...u, is_banned: !!u.is_banned, is_admin: !!u.is_admin })) });
});

// Ban / unban an account platform-wide (admin only).
router.post('/admin/users/:id/ban', authRequired, adminRequired, (req, res) => {
  const targetId = Number(req.params.id);
  const banned = req.body?.banned ? 1 : 0;
  const target = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя заблокировать себя' });
  if (target.is_admin) return res.status(403).json({ error: 'Нельзя заблокировать администратора' });

  db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(banned, targetId);
  if (banned) sendToUser(targetId, { type: 'account_banned' });
  res.json({ ok: true, banned: !!banned });
});

// Force-delete any server (admin only).
router.delete('/admin/servers/:id', authRequired, adminRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  broadcastToServer(serverId, { type: 'server_deleted', server_id: serverId });
  db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);
  res.json({ ok: true });
});

// List all servers (admin only).
router.get('/admin/servers', authRequired, adminRequired, (req, res) => {
  const servers = db
    .prepare(
      `SELECT s.id, s.name, s.owner_id, u.username AS owner_name,
              (SELECT COUNT(*) FROM memberships m WHERE m.server_id = s.id) AS members
       FROM servers s JOIN users u ON u.id = s.owner_id ORDER BY s.id`
    )
    .all();
  res.json({ servers });
});

/* ---------------------- Channel settings ---------------------- */

// Edit a channel — name and/or topic (MANAGE_CHANNELS).
router.patch('/channels/:id', authRequired, (req, res) => {
  const channelId = Number(req.params.id);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!hasPerm(req.user.id, channel.server_id, PERM.MANAGE_CHANNELS))
    return res.status(403).json({ error: 'Недостаточно прав' });

  let name = channel.name;
  if (req.body?.name !== undefined) {
    name = String(req.body.name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9а-яё_-]/g, '');
    if (name.length < 1 || name.length > 24) return res.status(400).json({ error: 'Некорректное имя канала' });
    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, channelId);
  }
  let topic = channel.topic;
  if (req.body?.topic !== undefined) {
    topic = String(req.body.topic).slice(0, 200);
    db.prepare('UPDATE channels SET topic = ? WHERE id = ?').run(topic, channelId);
  }

  // Privacy / allowed roles.
  let visibilityChanged = false;
  if (req.body?.is_private !== undefined) {
    const isPrivate = req.body.is_private ? 1 : 0;
    db.prepare('UPDATE channels SET is_private = ? WHERE id = ?').run(isPrivate, channelId);
    visibilityChanged = true;
  }
  if (req.body?.role_ids !== undefined) {
    const ids = Array.isArray(req.body.role_ids) ? req.body.role_ids.map(Number) : [];
    const valid = new Set(db.prepare('SELECT id FROM roles WHERE server_id = ? AND is_default = 0').all(channel.server_id).map((r) => r.id));
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM channel_roles WHERE channel_id = ?').run(channelId);
      const ins = db.prepare('INSERT OR IGNORE INTO channel_roles (channel_id, role_id) VALUES (?, ?)');
      for (const rid of ids) if (valid.has(rid)) ins.run(channelId, rid);
    });
    tx();
    visibilityChanged = true;
  }

  if (visibilityChanged) {
    // Membership of the channel may have changed for many users — have everyone refresh.
    broadcastToServer(channel.server_id, { type: 'server_channels', server_id: channel.server_id });
  } else {
    broadcastToServer(channel.server_id, { type: 'channel_updated', server_id: channel.server_id, channel: { id: channelId, name, topic } });
  }
  res.json({ ok: true, name, topic });
});

// Delete a channel (MANAGE_CHANNELS).
router.delete('/channels/:id', authRequired, (req, res) => {
  const channelId = Number(req.params.id);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!hasPerm(req.user.id, channel.server_id, PERM.MANAGE_CHANNELS))
    return res.status(403).json({ error: 'Недостаточно прав' });

  db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
  broadcastToServer(channel.server_id, { type: 'server_channels', server_id: channel.server_id });
  res.json({ ok: true });
});

/* ---------------------- Roles ---------------------- */

function serializeRole(r) {
  return { id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, is_default: !!r.is_default };
}

// List roles of a server (any member).
router.get('/servers/:id/roles', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  if (!assertMember(req.user.id, serverId)) return res.status(403).json({ error: 'Нет доступа' });
  const roles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, id').all(serverId);
  res.json({ roles: roles.map(serializeRole) });
});

// Create a role (MANAGE_ROLES).
router.post('/servers/:id/roles', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (!hasPerm(req.user.id, serverId, PERM.MANAGE_ROLES)) return res.status(403).json({ error: 'Недостаточно прав' });

  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Укажите название роли' });
  const color = req.body?.color ? String(req.body.color).slice(0, 9) : null;
  let permissions = Number(req.body?.permissions) || 0;
  permissions &= ALL_PERMS;
  // You cannot grant permissions you don't have.
  permissions &= memberPermissions(req.user.id, serverId);

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM roles WHERE server_id = ?').get(serverId).p;
  const info = db
    .prepare('INSERT INTO roles (server_id, name, color, position, permissions, is_default, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(serverId, name, color, maxPos + 1, permissions, now());
  broadcastToServer(serverId, { type: 'roles_updated', server_id: serverId });
  res.json({ role: serializeRole(db.prepare('SELECT * FROM roles WHERE id = ?').get(info.lastInsertRowid)) });
});

// Edit a role (MANAGE_ROLES + hierarchy).
router.patch('/roles/:id', authRequired, (req, res) => {
  const roleId = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });
  if (!hasPerm(req.user.id, role.server_id, PERM.MANAGE_ROLES)) return res.status(403).json({ error: 'Недостаточно прав' });
  if (role.position >= highestPosition(req.user.id, role.server_id))
    return res.status(403).json({ error: 'Нельзя изменять роль на своём уровне или выше' });

  if (req.body?.name !== undefined && !role.is_default) {
    const name = String(req.body.name).trim().slice(0, 30);
    if (name) db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name, roleId);
  }
  if (req.body?.color !== undefined && !role.is_default) {
    const color = req.body.color ? String(req.body.color).slice(0, 9) : null;
    db.prepare('UPDATE roles SET color = ? WHERE id = ?').run(color, roleId);
  }
  if (req.body?.permissions !== undefined) {
    let permissions = (Number(req.body.permissions) || 0) & ALL_PERMS;
    permissions &= memberPermissions(req.user.id, role.server_id); // can't grant what you lack
    db.prepare('UPDATE roles SET permissions = ? WHERE id = ?').run(permissions, roleId);
  }
  broadcastToServer(role.server_id, { type: 'roles_updated', server_id: role.server_id });
  res.json({ ok: true });
});

// Delete a role (MANAGE_ROLES + hierarchy; not @everyone).
router.delete('/roles/:id', authRequired, (req, res) => {
  const roleId = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
  if (!role) return res.status(404).json({ error: 'Роль не найдена' });
  if (role.is_default) return res.status(400).json({ error: 'Нельзя удалить роль @everyone' });
  if (!hasPerm(req.user.id, role.server_id, PERM.MANAGE_ROLES)) return res.status(403).json({ error: 'Недостаточно прав' });
  if (role.position >= highestPosition(req.user.id, role.server_id))
    return res.status(403).json({ error: 'Нельзя удалить роль на своём уровне или выше' });

  db.prepare('DELETE FROM roles WHERE id = ?').run(roleId); // cascades member_roles
  broadcastToServer(role.server_id, { type: 'roles_updated', server_id: role.server_id });
  res.json({ ok: true });
});

// Set a member's roles (MANAGE_ROLES + hierarchy).
router.put('/servers/:id/members/:userId/roles', authRequired, (req, res) => {
  const serverId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  if (!hasPerm(req.user.id, serverId, PERM.MANAGE_ROLES)) return res.status(403).json({ error: 'Недостаточно прав' });
  const membership = db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?').get(targetId, serverId);
  if (!membership) return res.status(404).json({ error: 'Участник не найден' });

  const wanted = Array.isArray(req.body?.role_ids) ? req.body.role_ids.map(Number) : [];
  const roles = db.prepare('SELECT id, position, is_default FROM roles WHERE server_id = ?').all(serverId);
  const actorPos = highestPosition(req.user.id, serverId);
  const valid = new Set(roles.filter((r) => !r.is_default && r.position < actorPos).map((r) => r.id));
  // Keep the target's roles that are at/above the actor's level (can't touch those),
  // plus the requested roles the actor is allowed to assign.
  const current = db.prepare('SELECT role_id FROM member_roles WHERE user_id = ? AND server_id = ?').all(targetId, serverId).map((r) => r.role_id);
  const locked = current.filter((rid) => !valid.has(rid));
  const finalSet = new Set([...locked, ...wanted.filter((rid) => valid.has(rid))]);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM member_roles WHERE user_id = ? AND server_id = ?').run(targetId, serverId);
    const ins = db.prepare('INSERT OR IGNORE INTO member_roles (user_id, server_id, role_id) VALUES (?, ?, ?)');
    for (const rid of finalSet) ins.run(targetId, serverId, rid);
  });
  tx();
  broadcastToServer(serverId, { type: 'member_roles_updated', server_id: serverId, user_id: targetId });
  res.json({ ok: true, role_ids: [...finalSet] });
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
  if (!canViewChannel(req.user.id, channel))
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
      `SELECT m.*, c.server_id, c.is_private, s.owner_id
       FROM messages m
       JOIN channels c ON c.id = m.channel_id
       JOIN servers s ON s.id = c.server_id
       WHERE m.id = ?`
    )
    .get(messageId);
  if (!m) return { error: 404 };
  if (!canViewChannel(userId, { id: m.channel_id, server_id: m.server_id, is_private: m.is_private })) return { error: 403 };
  return { message: m };
}

// Build a channel descriptor for broadcastToChannel from a loaded message.
function channelOf(message) {
  return { id: message.channel_id, server_id: message.server_id, is_private: message.is_private };
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
  broadcastToChannel(channelOf(message), {
    type: 'message_updated',
    message: { id: message.id, channel_id: message.channel_id, content, edited_at: ts },
  });
  res.json({ ok: true });
});

// Delete a message (author or server owner).
router.delete('/messages/:id', authRequired, (req, res) => {
  const { message, error } = loadMessageForUser(Number(req.params.id), req.user.id);
  if (error) return res.status(error).json({ error: error === 404 ? 'Сообщение не найдено' : 'Нет доступа' });
  if (message.user_id !== req.user.id && !hasPerm(req.user.id, message.server_id, PERM.MANAGE_MESSAGES))
    return res.status(403).json({ error: 'Нет прав на удаление' });

  db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
  broadcastToChannel(channelOf(message), {
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
  broadcastToChannel(channelOf(message), {
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
