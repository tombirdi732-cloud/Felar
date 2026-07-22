/* ============================================================
   Felar — client application
   ============================================================ */

const state = {
  token: localStorage.getItem('felar_token') || null,
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

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, {
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
    : 'Создай аккаунт, чтобы присоединиться к Felar.';
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

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  try {
    const data = await api(`/auth/${authMode}`, {
      method: 'POST',
      body: { username, password },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('felar_token', data.token);
    await startApp();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

function logout() {
  localStorage.removeItem('felar_token');
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
  renderServerRail();

  if (servers.length && !state.currentServerId) {
    selectServer(servers[0].id);
  } else if (!servers.length) {
    $('server-name').textContent = 'Нет серверов';
  }
}

/* ------------------- server rail ------------------- */
function renderServerRail() {
  const list = $('server-list');
  list.innerHTML = '';
  for (const s of state.servers) {
    const item = el('div', 'rail-item', initials(s.name));
    item.title = s.name;
    if (s.id === state.currentServerId) item.classList.add('active');
    item.addEventListener('click', () => selectServer(s.id));
    list.appendChild(item);
  }
}

async function selectServer(serverId) {
  state.currentServerId = serverId;
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return;

  renderServerRail();
  $('rail-home').classList.remove('active');
  $('server-name').textContent = server.name;

  renderChannels(server);
  loadMembers(serverId);

  // Auto-select first channel.
  if (server.channels.length) {
    selectChannel(server.channels[0].id);
  } else {
    state.currentChannelId = null;
    $('messages').innerHTML = '';
    $('channel-name').textContent = '—';
  }
}

/* ------------------- channels ------------------- */
function renderChannels(server) {
  const list = $('channel-list');
  list.innerHTML = '';

  const cat = el('div', 'channel-category');
  cat.appendChild(el('span', null, 'Текстовые каналы'));
  if (server.owner_id === state.user.id) {
    const add = el('span', 'add-channel', '+');
    add.title = 'Создать канал';
    add.addEventListener('click', () => openChannelModal());
    cat.appendChild(add);
  }
  list.appendChild(cat);

  for (const ch of server.channels) {
    const item = el('div', 'channel');
    if (ch.id === state.currentChannelId) item.classList.add('active');
    item.appendChild(el('span', 'hash', '#'));
    item.appendChild(el('span', null, ch.name));
    item.addEventListener('click', () => selectChannel(ch.id));
    list.appendChild(item);
  }

  // Invite code hint
  const invite = el('div', 'channel-category');
  invite.appendChild(el('span', null, `Код: ${server.invite_code}`));
  const copy = el('span', 'add-channel', '⧉');
  copy.title = 'Скопировать код';
  copy.addEventListener('click', () => {
    navigator.clipboard?.writeText(server.invite_code);
    copy.textContent = '✓';
    setTimeout(() => (copy.textContent = '⧉'), 1200);
  });
  invite.appendChild(copy);
  list.appendChild(invite);
}

async function selectChannel(channelId) {
  state.currentChannelId = channelId;
  const server = state.servers.find((s) => s.id === state.currentServerId);
  const channel = server?.channels.find((c) => c.id === channelId);
  if (!channel) return;

  renderChannels(server);
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
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${state.token}`);
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
    if (msg.server_id === state.currentServerId) renderChannels(server);
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
$('rail-add').addEventListener('click', () => $('modal-overlay').classList.remove('hidden'));
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
    renderServerRail();
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
    renderServerRail();
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
    renderChannels(server);
    selectChannel(channel.id);
  } catch (err) {
    $('channel-modal-error').textContent = err.message;
  }
});

/* home button */
$('rail-home').addEventListener('click', () => {
  $('rail-home').classList.add('active');
  state.currentServerId = null;
  state.currentChannelId = null;
  renderServerRail();
  $('server-name').textContent = 'Личное пространство';
  $('channel-list').innerHTML = '';
  $('messages').innerHTML =
    '<div class="empty-hint"><h2>Добро пожаловать в Felar</h2>' +
    '<p>Выберите сервер слева или создайте новый.</p></div>';
  $('channel-name').textContent = '—';
  $('composer-input').disabled = true;
  $('members-list').innerHTML = '';
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
      localStorage.removeItem('felar_token');
      state.token = null;
    }
  }
})();
