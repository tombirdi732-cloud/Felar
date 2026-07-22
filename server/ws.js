import { WebSocketServer } from 'ws';
import db from './db.js';
import { verifyToken } from './auth.js';
import {
  addConnection,
  removeConnection,
  broadcastToServer,
  sendToUser,
} from './hub.js';

const now = () => Date.now();

// Notify every server the user belongs to about a presence change.
function broadcastPresence(userId, online) {
  const servers = db
    .prepare('SELECT server_id FROM memberships WHERE user_id = ?')
    .all(userId);
  const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(userId);
  for (const { server_id } of servers) {
    broadcastToServer(server_id, { type: 'presence', user, online }, { exceptUserId: userId });
  }
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  if (msg.type === 'message') {
    const channelId = Number(msg.channel_id);
    const content = String(msg.content || '').trim();
    if (!channelId || !content) return;
    if (content.length > 2000) return;

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return;

    const member = db
      .prepare('SELECT 1 FROM memberships WHERE user_id = ? AND server_id = ?')
      .get(ws.userId, channel.server_id);
    if (!member) return;

    const ts = now();
    const info = db
      .prepare('INSERT INTO messages (channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?)')
      .run(channelId, ws.userId, content, ts);

    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(ws.userId);
    const payload = {
      type: 'message',
      message: {
        id: info.lastInsertRowid,
        channel_id: channelId,
        content,
        created_at: ts,
        edited_at: null,
        user_id: user.id,
        username: user.username,
        avatar: user.avatar,
        reactions: [],
      },
    };
    // Deliver to all members of the server (including sender, for confirmation).
    broadcastToServer(channel.server_id, payload);
    return;
  }

  if (msg.type === 'typing') {
    const channelId = Number(msg.channel_id);
    const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
    if (!channel) return;
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(ws.userId);
    broadcastToServer(
      channel.server_id,
      { type: 'typing', channel_id: channelId, user },
      { exceptUserId: ws.userId }
    );
    return;
  }

  if (msg.type === 'dm_message') {
    const threadId = Number(msg.thread_id);
    const content = String(msg.content || '').trim();
    if (!threadId || !content || content.length > 2000) return;

    const thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
    if (!thread || (thread.user_lo !== ws.userId && thread.user_hi !== ws.userId)) return;

    const ts = now();
    const info = db
      .prepare('INSERT INTO dm_messages (thread_id, user_id, content, created_at) VALUES (?, ?, ?, ?)')
      .run(threadId, ws.userId, content, ts);
    db.prepare('UPDATE dm_threads SET last_at = ? WHERE id = ?').run(ts, threadId);

    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(ws.userId);
    const payload = {
      type: 'dm_message',
      message: {
        id: info.lastInsertRowid,
        thread_id: threadId,
        content,
        created_at: ts,
        user_id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
    };
    sendToUser(thread.user_lo, payload);
    sendToUser(thread.user_hi, payload);
    return;
  }

  if (msg.type === 'dm_typing') {
    const threadId = Number(msg.thread_id);
    const thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
    if (!thread || (thread.user_lo !== ws.userId && thread.user_hi !== ws.userId)) return;
    const otherId = thread.user_lo === ws.userId ? thread.user_hi : thread.user_lo;
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(ws.userId);
    sendToUser(otherId, { type: 'dm_typing', thread_id: threadId, user });
  }
}

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Authenticate via ?token=... in the connection URL.
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token && verifyToken(token);
    if (!payload) {
      ws.close(4001, 'unauthorized');
      return;
    }

    ws.userId = payload.id;
    ws.isAlive = true;
    addConnection(ws.userId, ws);
    broadcastPresence(ws.userId, true);
    ws.send(JSON.stringify({ type: 'ready', user_id: ws.userId }));

    ws.on('message', (raw) => handleMessage(ws, raw));
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
      removeConnection(ws.userId, ws);
      // Only announce offline if the user has no remaining connections.
      import('./hub.js').then(({ isOnline }) => {
        if (!isOnline(ws.userId)) broadcastPresence(ws.userId, false);
      });
    });
  });

  // Heartbeat: drop dead connections.
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(interval));

  return wss;
}
