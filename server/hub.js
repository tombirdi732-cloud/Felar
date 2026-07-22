// Central registry of live WebSocket connections + broadcast helpers.
// Kept separate from ws.js to avoid circular imports with routes.js.

import db from './db.js';

// userId -> Set<WebSocket>
const connections = new Map();

export function addConnection(userId, ws) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(ws);
}

export function removeConnection(userId, ws) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

export function isOnline(userId) {
  return connections.has(userId);
}

export function onlineUserIds() {
  return [...connections.keys()];
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

// Send an event to every connected member of a server.
export function broadcastToServer(serverId, payload, { exceptUserId } = {}) {
  const members = db
    .prepare('SELECT user_id FROM memberships WHERE server_id = ?')
    .all(serverId);
  for (const { user_id } of members) {
    if (user_id === exceptUserId) continue;
    const set = connections.get(user_id);
    if (!set) continue;
    for (const ws of set) send(ws, payload);
  }
}

// Send an event to a single user across all their devices.
export function sendToUser(userId, payload) {
  const set = connections.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, payload);
}
