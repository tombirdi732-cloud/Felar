// Shared permission + channel-visibility helpers, used by routes.js and ws.js.
import db from './db.js';
import { PERM, ALL_PERMS } from './perms.js';
import { sendToUser } from './hub.js';

// Effective permission bitfield for a user on a server.
export function memberPermissions(userId, serverId) {
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return 0;
  if (server.owner_id === userId) return ALL_PERMS;
  const rows = db
    .prepare(
      `SELECT r.permissions FROM roles r
       LEFT JOIN member_roles mr ON mr.role_id = r.id AND mr.user_id = ?
       WHERE r.server_id = ? AND (r.is_default = 1 OR mr.user_id IS NOT NULL)`
    )
    .all(userId, serverId);
  let perms = 0;
  for (const r of rows) perms |= r.permissions;
  return perms & PERM.ADMINISTRATOR ? ALL_PERMS : perms;
}
export function hasPerm(userId, serverId, flag) {
  return (memberPermissions(userId, serverId) & flag) === flag;
}
// Highest role position a user holds (owner ranks above everything).
export function highestPosition(userId, serverId) {
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (server && server.owner_id === userId) return Infinity;
  const row = db
    .prepare(
      `SELECT MAX(r.position) AS p FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       WHERE mr.user_id = ? AND r.server_id = ?`
    )
    .get(userId, serverId);
  return row && row.p != null ? row.p : 0;
}

export function channelRoleIds(channelId) {
  return db.prepare('SELECT role_id FROM channel_roles WHERE channel_id = ?').all(channelId).map((r) => r.role_id);
}

// Can a user see a channel? `channel` must have {id, server_id, is_private}.
export function canViewChannel(userId, channel) {
  if (!channel) return false;
  const isMember = db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?').get(userId, channel.server_id);
  if (!isMember) return false;
  if (!channel.is_private) return true;
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(channel.server_id);
  if (server && server.owner_id === userId) return true;
  // Channel managers/admins always see private channels (so they can manage them).
  const perms = memberPermissions(userId, channel.server_id);
  if (perms & (PERM.ADMINISTRATOR | PERM.MANAGE_CHANNELS)) return true;
  const allowed = channelRoleIds(channel.id);
  if (!allowed.length) return false; // private with no roles = staff only
  const mine = db.prepare('SELECT role_id FROM member_roles WHERE user_id = ? AND server_id = ?').all(userId, channel.server_id).map((r) => r.role_id);
  return allowed.some((rid) => mine.includes(rid));
}

// User ids of every server member who can currently view the channel.
export function channelViewers(channel) {
  const members = db.prepare('SELECT user_id FROM memberships WHERE server_id = ?').all(channel.server_id).map((m) => m.user_id);
  return members.filter((uid) => canViewChannel(uid, channel));
}

// Broadcast a payload only to members who can view the channel.
export function broadcastToChannel(channel, payload, { exceptUserId } = {}) {
  for (const uid of channelViewers(channel)) {
    if (uid !== exceptUserId) sendToUser(uid, payload);
  }
}
