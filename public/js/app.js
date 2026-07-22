/* ============================================================
   Roost — client application
   ============================================================ */

const state = {
  token: localStorage.getItem('roost_token') || null,
  user: null,
  servers: [],
  currentServerId: null,
  currentChannelId: null,
  members: [],
  ws: null,
  typingTimers: {},
};

/* ----------------------- helpers ----------------------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* --------------------- server address ---------------------
   In the browser the client talks to the same origin that served it.
   In the desktop (Electron) and mobile (Capacitor) apps the page is
   loaded from a local file, so the backend address must be configured
   explicitly and is stored in localStorage. */
function getServerBase() {
  const saved = (localStorage.getItem('roost_server') || '').trim();
  if (saved) return saved.replace(/\/+$/, '');
  // Web build: default to same origin.
  if (location.protocol === 'http:' || location.protocol === 'https:') return '';
  return '';
}

function wsBase() {
  const base = getServerBase();
  if (base) return base.replace(/^http/, 'ws');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${getServerBase()}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function initials(name) {
  return (name || '?').trim().slice(0, 2);
}

function formatTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Сегодня, ${time}`;
  return `${d.toLocaleDateString('ru-RU')} ${time}`;
}

/* ======================= AUTH ======================= */
let authMode = 'login';

function renderAuthMode() {
  const isLogin = authMode === 'login';
  $('auth-sub').textContent = isLogin
    ? 'С возвращением! Мы рады видеть тебя снова.'
    : 'Создай аккаунт, чтобы присоединиться к Roost.';
  $('auth-submit').textContent = isLogin ? 'Войти' : 'Зарегистрироваться';
  $('auth-switch-text').textContent = isLogin ? 'Нужен аккаунт?' : 'Уже есть аккаунт?';
  $('auth-switch-link').textContent = isLogin ? 'Зарегистрироваться' : 'Войти';
  $('auth-error').textContent = '';
}

$('auth-switch-link').addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  renderAuthMode();
});

// Server-address settings: shown on demand, prefilled from storage.
$('server-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  const f = $('server-field');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) $('auth-server').focus();
});
$('auth-server').value = localStorage.getItem('roost_server') || '';
// In packaged apps (no http origin) the server field is required — reveal it.
if (location.protocol !== 'http:' && location.protocol !== 'https:') {
  $('server-field').classList.remove('hidden');
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  const serverAddr = $('auth-server').value.trim();
  if (serverAddr) localStorage.setItem('roost_server', serverAddr);
  else localStorage.removeItem('roost_server');
  try {
    const data = await api(`/auth/${authMode}`, {
      method: 'POST',
      body: { username, password },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('roost_token', data.token);
    await startApp();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

function logout() {
  localStorage.removeItem('roost_token');
  if (state.ws) state.ws.close();
  location.reload();
}
$('logout-btn').addEventListener('click', logout);

/* ======================= APP BOOT ======================= */
async function startApp() {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');

  $('me-name').textContent = state.user.username;
  $('me-avatar').textContent = initials(state.user.username);

  await loadServers();
  connectWebSocket();
}

async function loadServers() {
  const { servers } = await api('/servers');
  state.servers = servers;
  renderTree();

  if (servers.length && !state.currentServerId) {
    selectServer(servers[0].id);
  }
}

/* ------------- navigation tree (servers → channels) ------------- */
function renderTree() {
  const tree = $('nav-tree');
  tree.innerHTML = '';

  if (!state.servers.length) {
    const empty = el('div', 'tree-empty');
    empty.style.cssText = 'padding:20px 12px;color:var(--text-muted);font-size:13px;line-height:1.5';
    empty.textContent = 'Пока нет серверов. Создай первый кнопкой ниже или войди по коду приглашения.';
    tree.appendChild(empty);
    return;
  }

  for (const s of state.servers) {
    const isActive = s.id === state.currentServerId;
    const block = el('div', 'tree-server' + (isActive ? ' expanded active-server' : ''));

    const head = el('div', 'tree-server-head');
    head.appendChild(el('span', 'tree-caret', '▸'));
    head.appendChild(el('div', 'server-avatar', initials(s.name)));
    head.appendChild(el('span', 'tree-server-name', s.name));
    if (s.owner_id === state.user.id) {
      const add = el('span', 'tree-add-channel', '+');
      add.title = 'Создать канал';
      add.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentServerId = s.id;
        openChannelModal();
      });
      head.appendChild(add);
    }
    head.addEventListener('click', () => toggleServer(s.id));
    block.appendChild(head);

    if (isActive) {
      const chans = el('div', 'tree-channels');
      for (const ch of s.channels) {
        const item = el('div', 'channel' + (ch.id === state.currentChannelId ? ' active' : ''));
        item.appendChild(el('span', 'hash', '#'));
        item.appendChild(el('span', null, ch.name));
        item.addEventListener('click', () => selectChannel(ch.id));
        chans.appendChild(item);
      }

      const inv = el('div', 'tree-invite');
      inv.appendChild(el('span', null, 'Инвайт:'));
      inv.appendChild(el('span', 'code', s.invite_code));
      const copy = el('span', 'copy', '⧉');
      copy.title = 'Скопировать код';
      copy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(s.invite_code);
        copy.textContent = '✓';
        setTimeout(() => (copy.textContent = '⧉'), 1200);
      });
      inv.appendChild(copy);
      chans.appendChild(inv);

      block.appendChild(chans);
    }

    tree.appendChild(block);
  }
}

// Collapse if the clicked server is already open, otherwise open it.
function toggleServer(serverId) {
  if (state.currentServerId === serverId) {
    state.currentServerId = null;
    state.currentChannelId = null;
    renderTree();
    resetChat();
    return;
  }
  selectServer(serverId);
}

function selectServer(serverId) {
  state.currentServerId = serverId;
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return;

  renderTree();
  loadMembers(serverId);

  if (server.channels.length) {
    selectChannel(server.channels[0].id);
  } else {
    state.currentChannelId = null;
    resetChat();
  }
}

// Reset chat area to the welcome state (no channel selected).
function resetChat() {
  $('messages').innerHTML =
    '<div class="empty-hint"><h2>Добро пожаловать в Roost</h2>' +
    '<p>Выберите канал слева, чтобы начать общение.</p></div>';
  $('channel-name').textContent = '—';
  $('composer-input').disabled = true;
  $('members-list').innerHTML = '';
}

/* ------------------- channels ------------------- */
async function selectChannel(channelId) {
  state.currentChannelId = channelId;
  const server = state.servers.find((s) => s.id === state.currentServerId);
  const channel = server?.channels.find((c) => c.id === channelId);
  if (!channel) return;

  renderTree();
  $('channel-name').textContent = channel.name;
  $('composer-input').disabled = false;
  $('composer-input').placeholder = `Написать в #${channel.name}`;

  await loadMessages(channelId);
}

/* ------------------- messages ------------------- */
let lastMsg = null;

async function loadMessages(channelId) {
  const box = $('messages');
  box.innerHTML = '';
  lastMsg = null;
  const { messages } = await api(`/channels/${channelId}/messages`);
  if (!messages.length) {
    const hint = el('div', 'empty-hint');
    hint.appendChild(el('h2', null, 'Здесь пока пусто'));
    hint.appendChild(el('p', null, 'Отправьте первое сообщение в этот канал!'));
    box.appendChild(hint);
    return;
  }
  for (const m of messages) appendMessage(m, false);
  scrollToBottom();
}

function appendMessage(m, animate = true) {
  if (m.channel_id && m.channel_id !== state.currentChannelId) return;
  const box = $('messages');
  const hint = box.querySelector('.empty-hint');
  if (hint) hint.remove();

  const grouped =
    lastMsg &&
    lastMsg.user_id === m.user_id &&
    m.created_at - lastMsg.created_at < 5 * 60 * 1000;

  const row = el('div', 'message' + (grouped ? ' grouped' : ''));

  const avatar = el('div', 'avatar', initials(m.username));
  row.appendChild(avatar);

  const body = el('div', 'message-body');
  const head = el('div', 'message-head');
  head.appendChild(el('span', 'message-author', m.username));
  head.appendChild(el('span', 'message-time', formatTime(m.created_at)));
  body.appendChild(head);
  body.appendChild(el('div', 'message-text', m.content));
  row.appendChild(body);

  box.appendChild(row);
  lastMsg = m;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
  if (animate && nearBottom) scrollToBottom();
  else if (!animate) scrollToBottom();
}

function scrollToBottom() {
  const box = $('messages');
  box.scrollTop = box.scrollHeight;
}

/* composer */
$('composer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const input = e.target;
    const content = input.value.trim();
    if (!content || !state.currentChannelId) return;
    sendWs({ type: 'message', channel_id: state.currentChannelId, content });
    input.value = '';
  } else {
    sendWs({ type: 'typing', channel_id: state.currentChannelId });
  }
});

/* ------------------- members ------------------- */
async function loadMembers(serverId) {
  try {
    const { members } = await api(`/servers/${serverId}/members`);
    state.members = members;
    renderMembers();
  } catch { /* ignore */ }
}

function renderMembers() {
  const box = $('members-list');
  box.innerHTML = '';
  const online = state.members.filter((m) => m.online);
  const offline = state.members.filter((m) => !m.online);

  const section = (title, list) => {
    if (!list.length) return;
    box.appendChild(el('div', 'members-heading', `${title} — ${list.length}`));
    for (const m of list) {
      const row = el('div', 'member' + (m.online ? '' : ' offline'));
      const av = el('div', 'avatar', initials(m.username));
      av.appendChild(el('span', 'status-dot'));
      row.appendChild(av);
      row.appendChild(el('span', 'member-name', m.username));
      box.appendChild(row);
    }
  };
  section('В сети', online);
  section('Не в сети', offline);
}

function setPresence(userId, isOnline) {
  const m = state.members.find((x) => x.id === userId);
  if (m) {
    m.online = isOnline;
    renderMembers();
  }
}

$('toggle-members').addEventListener('click', () => {
  $('members').classList.toggle('hidden');
});

/* ======================= WebSocket ======================= */
function connectWebSocket() {
  const ws = new WebSocket(`${wsBase()}/ws?token=${state.token}`);
  state.ws = ws;

  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleWsEvent(msg);
  });

  ws.addEventListener('close', () => {
    // Attempt reconnect after a short delay.
    setTimeout(() => { if (state.token) connectWebSocket(); }, 2000);
  });
}

function sendWs(payload) {
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify(payload));
  }
}

function handleWsEvent(msg) {
  switch (msg.type) {
    case 'message':
      appendMessage(msg.message);
      break;
    case 'presence':
      setPresence(msg.user.id, msg.online);
      break;
    case 'member_joined':
      if (msg.server_id === state.currentServerId) loadMembers(msg.server_id);
      break;
    case 'channel_created':
      handleChannelCreated(msg);
      break;
    case 'typing':
      showTyping(msg);
      break;
  }
}

function handleChannelCreated(msg) {
  const server = state.servers.find((s) => s.id === msg.server_id);
  if (!server) return;
  if (!server.channels.find((c) => c.id === msg.channel.id)) {
    server.channels.push(msg.channel);
    if (msg.server_id === state.currentServerId) renderTree();
  }
}

/* typing indicator */
function showTyping(msg) {
  if (msg.channel_id !== state.currentChannelId) return;
  const key = msg.user.id;
  $('typing-indicator').textContent = `${msg.user.username} печатает…`;
  clearTimeout(state.typingTimers[key]);
  state.typingTimers[key] = setTimeout(() => {
    $('typing-indicator').textContent = '';
  }, 2500);
}

/* ======================= Modals ======================= */
$('add-server-btn').addEventListener('click', () => $('modal-overlay').classList.remove('hidden'));
$('modal-close').addEventListener('click', () => $('modal-overlay').classList.add('hidden'));
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) $('modal-overlay').classList.add('hidden');
});

document.querySelectorAll('.modal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.querySelectorAll('.modal-body').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.panel !== target);
    });
    $('modal-error').textContent = '';
  });
});

$('create-server-btn').addEventListener('click', async () => {
  const name = $('new-server-name').value.trim();
  try {
    const { server } = await api('/servers', { method: 'POST', body: { name } });
    state.servers.push(server);
    $('new-server-name').value = '';
    $('modal-overlay').classList.add('hidden');
    renderTree();
    selectServer(server.id);
  } catch (err) {
    $('modal-error').textContent = err.message;
  }
});

$('join-server-btn').addEventListener('click', async () => {
  const invite_code = $('join-code').value.trim();
  try {
    const { server } = await api('/servers/join', { method: 'POST', body: { invite_code } });
    if (!state.servers.find((s) => s.id === server.id)) state.servers.push(server);
    $('join-code').value = '';
    $('modal-overlay').classList.add('hidden');
    renderTree();
    selectServer(server.id);
  } catch (err) {
    $('modal-error').textContent = err.message;
  }
});

/* channel modal */
function openChannelModal() {
  $('channel-modal-overlay').classList.remove('hidden');
  $('new-channel-name').focus();
}
$('channel-modal-close').addEventListener('click', () =>
  $('channel-modal-overlay').classList.add('hidden')
);
$('channel-modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('channel-modal-overlay')) $('channel-modal-overlay').classList.add('hidden');
});
$('create-channel-btn').addEventListener('click', async () => {
  const name = $('new-channel-name').value.trim();
  try {
    const { channel } = await api(`/servers/${state.currentServerId}/channels`, {
      method: 'POST',
      body: { name },
    });
    const server = state.servers.find((s) => s.id === state.currentServerId);
    if (server && !server.channels.find((c) => c.id === channel.id)) {
      server.channels.push(channel);
    }
    $('new-channel-name').value = '';
    $('channel-modal-overlay').classList.add('hidden');
    renderTree();
    selectChannel(channel.id);
  } catch (err) {
    $('channel-modal-error').textContent = err.message;
  }
});

/* brand / home button — collapse everything back to the welcome screen */
$('nav-home').addEventListener('click', () => {
  state.currentServerId = null;
  state.currentChannelId = null;
  renderTree();
  resetChat();
});

/* ======================= Bootstrap ======================= */
(async function init() {
  renderAuthMode();
  if (state.token) {
    try {
      const { user } = await api('/me');
      state.user = user;
      await startApp();
    } catch {
      localStorage.removeItem('roost_token');
      state.token = null;
    }
  }
})();
