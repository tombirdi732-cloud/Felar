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
  view: 'chat',
  channelFilter: '',
  dmThreads: [],
  currentDmId: null,
  dmPeer: null,
  roles: [],
  myPerms: 0,
  myPosition: 0,
  myOwner: false,
};

/* ----------------------- helpers ----------------------- */
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function icon(name, cls = 'ic') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS(SVGNS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

const PALETTE = ['#6366f1', '#2dd4bf', '#e8a23a', '#f472b6', '#34d399', '#38bdf8', '#a78bfa', '#fb7185'];
function colorFor(name) {
  let h = 0;
  for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]);
  return String(name || '?').trim().slice(0, 2);
}
// Resolve an uploaded-file URL against the configured server base.
function fileSrc(url) {
  if (!url) return '';
  return (url.startsWith('/') ? getServerBase() : '') + url;
}

function avatarEl(name, { size = 'md', status, avatar } = {}) {
  const wrap = el('div', 'avatar ' + size);
  const c = el('div', 'avatar-circle');
  if (avatar) {
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.src = fileSrc(avatar);
    img.alt = '';
    img.onerror = () => { img.remove(); c.textContent = initials(name); c.style.backgroundColor = colorFor(name); };
    c.appendChild(img);
  } else {
    c.textContent = initials(name);
    c.style.backgroundColor = colorFor(name);
  }
  wrap.appendChild(c);
  if (status) wrap.appendChild(el('span', 'dot ' + status));
  return wrap;
}

// Build an attachment element (image preview or file card) for a message.
function attachmentEl(m) {
  if (!m.attachment_url) return null;
  const url = fileSrc(m.attachment_url);
  if ((m.attachment_type || '').startsWith('image/')) {
    const link = el('a', 'attach-img-link');
    link.href = url; link.target = '_blank'; link.rel = 'noopener';
    const img = document.createElement('img');
    img.className = 'attach-img'; img.src = url; img.alt = m.attachment_name || '';
    link.appendChild(img);
    return link;
  }
  const card = el('a', 'attach-file');
  card.href = url; card.target = '_blank'; card.rel = 'noopener'; card.download = m.attachment_name || 'file';
  card.appendChild(icon('paperclip', 'ic'));
  card.appendChild(el('span', 'attach-name', m.attachment_name || 'файл'));
  return card;
}

// Upload a file via the raw upload endpoint.
async function uploadFile(file) {
  const res = await fetch(`${getServerBase()}/api/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name || 'file'),
    },
    body: file,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Ошибка загрузки'); }
  return res.json();
}

/* --------------------- server address --------------------- */
function getServerBase() {
  const saved = (localStorage.getItem('roost_server') || '').trim();
  if (saved) return saved.replace(/\/+$/, '');
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
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function formatTime(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? `сегодня в ${time}` : `${d.toLocaleDateString('ru-RU')} в ${time}`;
}

/* --------------------- accent color --------------------- */
function applyAccent(hex) {
  if (!hex) return;
  document.documentElement.style.setProperty('--primary', hex);
}
applyAccent(localStorage.getItem('roost_accent'));

/* ======================= AUTH ======================= */
let authMode = 'login';
function renderAuthMode() {
  const isLogin = authMode === 'login';
  $('auth-sub').textContent = isLogin
    ? 'С возвращением. Рады видеть тебя снова.'
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
$('server-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  const f = $('server-field');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) $('auth-server').focus();
});
$('auth-server').value = localStorage.getItem('roost_server') || '';
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
    const data = await api(`/auth/${authMode}`, { method: 'POST', body: { username, password } });
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
$('settings-logout').addEventListener('click', logout);

/* ======================= APP BOOT ======================= */
async function startApp() {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');

  $('me-name').textContent = state.user.username;
  $('me-name-dm').textContent = state.user.username;
  refreshMyAvatars();

  await loadServers();
  connectWebSocket();
  loadRtcConfig();
}

// Re-render all avatars that represent the current user (after avatar change).
function refreshMyAvatars() {
  const opts = { size: 'sm', status: 'online', avatar: state.user.avatar };
  const a1 = avatarEl(state.user.username, opts); a1.id = 'me-avatar'; $('me-avatar').replaceWith(a1);
  const a2 = avatarEl(state.user.username, opts); a2.id = 'me-avatar-dm'; $('me-avatar-dm').replaceWith(a2);
  $('nav-profile').innerHTML = '';
  $('nav-profile').appendChild(avatarEl(state.user.username, opts));
}

// Pick and upload a new avatar image for the current user.
function pickAvatar() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const up = await uploadFile(f);
      const { user } = await api('/me', { method: 'PATCH', body: { avatar: up.url } });
      state.user = user;
      refreshMyAvatars();
      if (state.view === 'settings') renderSettings();
      if (state.view === 'profile') renderProfile();
    } catch (e) { alert(e.message); }
  };
  inp.click();
}

async function loadServers() {
  const { servers } = await api('/servers');
  state.servers = servers;
  renderRail();
  if (servers.length && !state.currentServerId) selectServer(servers[0].id);
  else if (!servers.length) { $('server-name').textContent = 'Нет серверов'; renderTree(); }
}

/* ------------------- rail (servers) ------------------- */
function renderRail() {
  const list = $('server-list');
  list.innerHTML = '';
  for (const s of state.servers) {
    const item = el('button', 'rail-item', initials(s.name));
    item.title = s.name;
    if (s.id === state.currentServerId && state.view === 'chat') item.classList.add('active');
    item.addEventListener('click', () => { showView('chat'); selectServer(s.id); });
    list.appendChild(item);
  }
}

function selectServer(serverId) {
  state.currentServerId = serverId;
  const server = state.servers.find((s) => s.id === serverId);
  if (!server) return;
  // Optimistic perms: owner sees management immediately; others until members load.
  state.myOwner = server.owner_id === state.user.id;
  state.myPerms = 0;
  state.roles = [];
  renderRail();
  $('server-name').textContent = server.name;
  renderTree();
  loadMembers(serverId);
  loadRoles(serverId);
  if (server.channels.length) selectChannel(server.channels[0].id);
  else { state.currentChannelId = null; resetChat(); }
}

async function loadRoles(serverId) {
  try {
    const { roles } = await api(`/servers/${serverId}/roles`);
    if (serverId === state.currentServerId) state.roles = roles;
  } catch { /* ignore */ }
}

/* ------------------- channel tree ------------------- */
function renderTree() {
  const tree = $('tree');
  tree.innerHTML = '';
  const server = state.servers.find((s) => s.id === state.currentServerId);
  if (!server) {
    tree.appendChild(el('div', 'tree-empty', 'Нет серверов. Создай первый кнопкой + слева или войди по коду приглашения.'));
    return;
  }

  const cat = el('div', 'cat');
  const head = el('div', 'cat-head');
  const chev = icon('chevron-down', 'ic'); chev.style.width = '12px'; chev.style.height = '12px';
  head.appendChild(chev);
  head.appendChild(el('span', 'cat-name', 'Каналы'));
  if (hasPerm(PERM.MANAGE_CHANNELS)) {
    const add = el('span', 'cat-add');
    add.appendChild(icon('plus', 'ic ic-sm'));
    add.title = 'Создать канал';
    add.addEventListener('click', (e) => { e.stopPropagation(); openChannelModal(); });
    head.appendChild(add);
  }
  cat.appendChild(head);

  const chans = el('div', 'cat-channels');
  const filter = state.channelFilter.toLowerCase();
  const visible = server.channels.filter((c) => !filter || c.name.toLowerCase().includes(filter));
  for (const ch of visible) {
    const item = el('button', 'channel' + (ch.id === state.currentChannelId ? ' active' : ''));
    item.appendChild(icon('hash', 'ic ic-sm'));
    item.appendChild(el('span', 'ch-name', ch.name));
    if (ch.is_private) { const lk = icon('lock', 'ic ic-sm'); lk.classList.add('ch-lock'); item.appendChild(lk); }
    item.addEventListener('click', () => { showView('chat'); selectChannel(ch.id); });
    chans.appendChild(item);
  }
  cat.appendChild(chans);
  tree.appendChild(cat);

  // invite code card
  const inv = el('div', 'invite-row');
  inv.appendChild(el('span', null, 'Инвайт:'));
  inv.appendChild(el('span', 'code', server.invite_code));
  const copy = el('button', 'copy');
  copy.appendChild(icon('copy', 'ic ic-sm'));
  copy.title = 'Скопировать код';
  copy.addEventListener('click', () => {
    navigator.clipboard?.writeText(server.invite_code);
    copy.innerHTML = ''; copy.textContent = '✓';
    setTimeout(() => { copy.innerHTML = ''; copy.appendChild(icon('copy', 'ic ic-sm')); }, 1200);
  });
  inv.appendChild(copy);
  tree.appendChild(inv);
}

$('channel-search').addEventListener('input', (e) => {
  state.channelFilter = e.target.value;
  renderTree();
});

/* ------------------- channels & messages ------------------- */
async function selectChannel(channelId) {
  state.currentChannelId = channelId;
  const server = state.servers.find((s) => s.id === state.currentServerId);
  const channel = server?.channels.find((c) => c.id === channelId);
  if (!channel) return;
  renderTree();
  $('channel-name').textContent = channel.name;
  $('channel-topic').textContent = channel.topic || `Канал #${channel.name}`;
  $('composer-input').disabled = false;
  $('composer-input').placeholder = `Написать в #${channel.name}`;
  await loadMessages(channelId);
}

function resetChat() {
  $('messages').innerHTML =
    '<div class="empty-hint"><h2>Добро пожаловать в Roost</h2><p>Выберите канал слева, чтобы начать общение.</p></div>';
  $('channel-name').textContent = '—';
  $('channel-topic').textContent = '';
  $('composer-input').disabled = true;
  $('members-list').innerHTML = '';
}

let lastMsg = null;
async function loadMessages(channelId) {
  const box = $('messages');
  box.innerHTML = '';
  lastMsg = null;
  msgById.clear();
  const { messages } = await api(`/channels/${channelId}/messages`);
  if (!messages.length) {
    const hint = el('div', 'empty-hint');
    hint.appendChild(el('h2', null, 'Здесь пока пусто'));
    hint.appendChild(el('p', null, 'Отправьте первое сообщение в этот канал!'));
    box.appendChild(hint);
    return;
  }
  const divider = el('div', 'date-divider');
  divider.appendChild(el('div', 'line'));
  divider.appendChild(el('span', null, 'Начало канала'));
  divider.appendChild(el('div', 'line'));
  box.appendChild(divider);
  for (const m of messages) appendMessage(m, false);
  scrollToBottom();
}

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '✅'];
const msgById = new Map(); // id -> message data (for in-place updates)

// Permission flags (mirror of server/perms.js).
const PERM = { ADMINISTRATOR: 1, MANAGE_SERVER: 2, MANAGE_ROLES: 4, MANAGE_CHANNELS: 8, KICK_MEMBERS: 16, MANAGE_MESSAGES: 32 };
const PERM_LIST = [
  ['MANAGE_SERVER', 'Управление сервером'],
  ['MANAGE_ROLES', 'Управление ролями'],
  ['MANAGE_CHANNELS', 'Управление каналами'],
  ['KICK_MEMBERS', 'Исключение участников'],
  ['MANAGE_MESSAGES', 'Управление сообщениями'],
  ['ADMINISTRATOR', 'Администратор (все права)'],
];
function hasPerm(flag) {
  if (state.myOwner) return true;
  if (state.myPerms & PERM.ADMINISTRATOR) return true;
  return (state.myPerms & flag) === flag;
}

// (Re)build the body of a message row from its data.
function fillMessageBody(row, m) {
  const body = row.querySelector('.body');
  body.innerHTML = '';

  const head = el('div', 'head');
  head.appendChild(el('span', 'author', m.username));
  head.appendChild(el('span', 'time', formatTime(m.created_at)));
  body.appendChild(head);

  if (m.content) {
    const textWrap = el('div', 'text');
    textWrap.appendChild(document.createTextNode(m.content));
    if (m.edited_at) textWrap.appendChild(el('span', 'edited', ' (изменено)'));
    body.appendChild(textWrap);
  }
  const att = attachmentEl(m);
  if (att) body.appendChild(att);

  // reactions
  if (m.reactions && m.reactions.length) {
    const wrap = el('div', 'reactions');
    for (const r of m.reactions) {
      const mine = r.users && r.users.includes(state.user.id);
      const pill = el('button', 'reaction' + (mine ? ' mine' : ''));
      pill.appendChild(el('span', null, r.emoji));
      pill.appendChild(el('span', 'rc', String(r.count)));
      pill.addEventListener('click', () => toggleReaction(m.id, r.emoji));
      wrap.appendChild(pill);
    }
    body.appendChild(wrap);
  }

  // hover actions
  const actions = el('div', 'hover-actions');
  const reactBtn = el('button', 'ha-btn');
  reactBtn.appendChild(icon('smile', 'ic ic-sm'));
  reactBtn.title = 'Реакция';
  reactBtn.addEventListener('click', (e) => { e.stopPropagation(); openEmojiPicker(row, m.id); });
  actions.appendChild(reactBtn);

  if (m.user_id === state.user.id) {
    const editBtn = el('button', 'ha-btn');
    editBtn.appendChild(icon('edit', 'ic ic-sm'));
    editBtn.title = 'Редактировать';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); startEdit(row, m); });
    actions.appendChild(editBtn);
  }
  if (m.user_id === state.user.id || hasPerm(PERM.MANAGE_MESSAGES)) {
    const delBtn = el('button', 'ha-btn danger');
    delBtn.appendChild(icon('x', 'ic ic-sm'));
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMessage(m.id); });
    actions.appendChild(delBtn);
  }
  body.appendChild(actions);
}

function appendMessage(m, animate = true) {
  if (m.channel_id && m.channel_id !== state.currentChannelId) return;
  const box = $('messages');
  const hint = box.querySelector('.empty-hint');
  if (hint) hint.remove();

  msgById.set(m.id, m);
  const grouped = lastMsg && lastMsg.user_id === m.user_id && m.created_at - lastMsg.created_at < 5 * 60 * 1000;
  const row = el('div', 'msg' + (grouped ? ' grouped' : ''));
  row.dataset.mid = m.id;
  row.appendChild(avatarEl(m.username, { size: 'md', avatar: m.avatar }));
  row.appendChild(el('div', 'body'));
  fillMessageBody(row, m);

  box.appendChild(row);
  lastMsg = m;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 200;
  if (!animate || nearBottom) scrollToBottom();
}
function rowFor(id) { return $('messages').querySelector(`.msg[data-mid="${id}"]`); }
function scrollToBottom() { const b = $('messages'); b.scrollTop = b.scrollHeight; }

/* ---- message actions ---- */
async function toggleReaction(id, emoji) {
  try { await api(`/messages/${id}/react`, { method: 'POST', body: { emoji } }); }
  catch { /* ignore */ }
}
async function deleteMessage(id) {
  if (!confirm('Удалить сообщение?')) return;
  try { await api(`/messages/${id}`, { method: 'DELETE' }); }
  catch (e) { alert(e.message); }
}
function startEdit(row, m) {
  const body = row.querySelector('.body');
  const existing = body.querySelector('.edit-box');
  if (existing) return;
  const box = el('div', 'edit-box');
  const ta = el('textarea', 'edit-input');
  ta.value = m.content;
  box.appendChild(ta);
  const hint = el('div', 'edit-hint', 'Enter — сохранить · Esc — отмена');
  box.appendChild(hint);
  const textEl = body.querySelector('.text');
  textEl.style.display = 'none';
  textEl.after(box);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const cancel = () => { box.remove(); textEl.style.display = ''; };
  ta.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const content = ta.value.trim();
      if (!content) return;
      try { await api(`/messages/${m.id}`, { method: 'PATCH', body: { content } }); cancel(); }
      catch (err) { alert(err.message); }
    }
  });
}

/* ---- emoji picker popover ---- */
let openPicker = null;
function closeEmojiPicker() { if (openPicker) { openPicker.remove(); openPicker = null; } }
function openEmojiPicker(row, messageId) {
  closeEmojiPicker();
  const pop = el('div', 'emoji-picker');
  for (const e of REACTION_EMOJIS) {
    const b = el('button', 'emoji-opt', e);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); toggleReaction(messageId, e); closeEmojiPicker(); });
    pop.appendChild(b);
  }
  row.appendChild(pop);
  openPicker = pop;
  setTimeout(() => document.addEventListener('click', closeEmojiPicker, { once: true }), 0);
}

function sendCurrent() {
  const input = $('composer-input');
  const content = input.value.trim();
  if (!content || !state.currentChannelId) return;
  sendWs({ type: 'message', channel_id: state.currentChannelId, content });
  input.value = '';
}
$('composer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
  else sendWs({ type: 'typing', channel_id: state.currentChannelId });
});
$('send-btn').addEventListener('click', sendCurrent);

// Attach + send a file (kind: 'channel' | 'dm').
function pickAndSendFile(kind) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const up = await uploadFile(f);
      const attachment = { url: up.url, name: up.name, type: up.type };
      if (kind === 'dm') {
        if (!state.currentDmId) return;
        sendWs({ type: 'dm_message', thread_id: state.currentDmId, content: $('dm-input').value.trim(), attachment });
        $('dm-input').value = '';
      } else {
        if (!state.currentChannelId) return;
        sendWs({ type: 'message', channel_id: state.currentChannelId, content: $('composer-input').value.trim(), attachment });
        $('composer-input').value = '';
      }
    } catch (e) { alert(e.message); }
  };
  inp.click();
}
$('chat-attach').addEventListener('click', () => pickAndSendFile('channel'));
$('dm-attach').addEventListener('click', () => pickAndSendFile('dm'));

/* ------------------- members ------------------- */
async function loadMembers(serverId) {
  try {
    const { members, me } = await api(`/servers/${serverId}/members`);
    if (serverId !== state.currentServerId) return;
    state.members = members;
    if (me) { state.myPerms = me.permissions; state.myOwner = me.owner; state.myPosition = me.position; }
    renderMembers();
    if (state.view === 'chat') renderTree();
  } catch { /* ignore */ }
}
function renderMembers() {
  const box = $('members-list');
  box.innerHTML = '';
  const roleOf = (m) => (m.owner ? 'Владелец' : (m.top ? m.top.name : 'Участник'));
  const roleColor = (m) => (m.owner ? '#e8a23a' : (m.top && m.top.color) || null);
  const online = state.members.filter((m) => m.online);
  const offline = state.members.filter((m) => !m.online);

  const section = (title, list, isOnline) => {
    if (!list.length) return;
    box.appendChild(el('div', 'members-heading', `${title} — ${list.length}`));
    for (const m of list) {
      const row = el('div', 'member' + (isOnline ? '' : ' offline'));
      row.appendChild(avatarEl(m.username, { size: 'sm', status: isOnline ? 'online' : 'offline', avatar: m.avatar }));
      const info = el('div');
      info.style.minWidth = '0';
      const nameEl = el('div', 'm-name', m.username);
      const rc = roleColor(m);
      if (rc) nameEl.style.color = rc;
      info.appendChild(nameEl);
      info.appendChild(el('div', 'm-role', roleOf(m)));
      row.appendChild(info);
      if (m.id !== state.user.id) {
        row.title = 'Написать личное сообщение';
        row.addEventListener('click', () => startDmWith(m.id));
      }
      box.appendChild(row);
    }
  };
  section('В сети', online, true);
  section('Не в сети', offline, false);
}
function setPresence(userId, isOnline) {
  const m = state.members.find((x) => x.id === userId);
  if (m) { m.online = isOnline; renderMembers(); }
}
$('toggle-members').addEventListener('click', () => {
  const btn = $('toggle-members');
  $('members').classList.toggle('hidden');
  btn.classList.toggle('active', !$('members').classList.contains('hidden'));
});

/* ======================= views ======================= */
function showView(v) {
  state.view = v;
  $('chat-view').classList.toggle('hidden', v !== 'chat');
  $('dm-view').classList.toggle('hidden', v !== 'dms');
  $('profile-view').classList.toggle('hidden', v !== 'profile');
  $('settings-view').classList.toggle('hidden', v !== 'settings');
  $('sidebar').classList.toggle('hidden', v !== 'chat');
  $('dm-sidebar').classList.toggle('hidden', v !== 'dms');
  $('nav-settings').classList.toggle('active', v === 'settings');
  $('rail-logo').classList.toggle('active', v === 'dms');
  renderRail();
  if (v === 'profile') renderProfile();
  if (v === 'settings') renderSettings();
  if (v === 'dms') { $('rail-logo').classList.remove('has-unread'); loadDms(); }
}
$('nav-settings').addEventListener('click', () => showView('settings'));
$('nav-profile').addEventListener('click', () => showView('profile'));
document.querySelectorAll('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.goto)));

function renderProfile() {
  $('profile-name').textContent = state.user.username;
  $('profile-handle').textContent = state.user.username.toLowerCase().replace(/\s+/g, '.');
  $('stat-servers').textContent = state.servers.length;
  const av = avatarEl(state.user.username, { size: 'xl', status: 'online', avatar: state.user.avatar });
  av.id = 'profile-avatar';
  $('profile-avatar').replaceWith(av);
}

/* ------- settings ------- */
let settingsSection = 'account';
const localToggles = JSON.parse(localStorage.getItem('roost_toggles') || '{"sound":true,"desktop":true,"mentions":true,"dnd":false,"compact":false}');
function saveToggles() { localStorage.setItem('roost_toggles', JSON.stringify(localToggles)); }

document.querySelectorAll('.s-item[data-section]').forEach((b) =>
  b.addEventListener('click', () => {
    settingsSection = b.dataset.section;
    document.querySelectorAll('.s-item[data-section]').forEach((x) => x.classList.toggle('active', x === b));
    renderSettings();
  }));

function toggleRow(key, title, desc) {
  const row = el('div', 'setting-row');
  const left = el('div');
  left.appendChild(el('div', 's-title', title));
  left.appendChild(el('div', 's-desc', desc));
  row.appendChild(left);
  const t = el('button', 'toggle' + (localToggles[key] ? ' on' : ''));
  t.appendChild(el('span', 'knob'));
  t.addEventListener('click', () => { localToggles[key] = !localToggles[key]; saveToggles(); t.classList.toggle('on'); });
  row.appendChild(t);
  return row;
}

function renderSettings() {
  const c = $('settings-content');
  c.innerHTML = '';
  const block = el('div', 'settings-block');

  if (settingsSection === 'account') {
    c.appendChild(el('h2', null, 'Аккаунт'));
    const card = el('div', 'card');
    card.style.display = 'flex'; card.style.alignItems = 'center'; card.style.gap = '16px';
    card.appendChild(avatarEl(state.user.username, { size: 'lg', status: 'online', avatar: state.user.avatar }));
    const info = el('div'); info.style.flex = '1';
    info.appendChild(el('div', 's-title', state.user.username));
    info.appendChild(el('div', 's-desc', '@' + state.user.username.toLowerCase().replace(/\s+/g, '.')));
    card.appendChild(info);
    const avBtn = el('button', 'btn-mini', 'Изменить аватар');
    avBtn.addEventListener('click', pickAvatar);
    card.appendChild(avBtn);
    block.appendChild(card);
    const note = el('p', 's-desc');
    note.style.marginTop = '16px';
    note.textContent = 'Почта, телефон и смена пароля появятся, когда расширим профиль на сервере.';
    block.appendChild(note);
  } else if (settingsSection === 'appearance') {
    c.appendChild(el('h2', null, 'Внешний вид'));
    block.appendChild(el('div', 'field-label', 'Акцентный цвет'));
    const row = el('div', 'swatch-row');
    const current = localStorage.getItem('roost_accent') || '#e8a23a';
    ['#e8a23a', '#6366f1', '#2dd4bf', '#e53e3e', '#f472b6', '#34d399'].forEach((hex) => {
      const sw = el('button', 'swatch' + (hex === current ? ' active' : ''));
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', () => {
        localStorage.setItem('roost_accent', hex);
        applyAccent(hex);
        renderSettings();
      });
      row.appendChild(sw);
    });
    block.appendChild(row);
    block.appendChild(toggleRow('compact', 'Компактный режим', 'Уменьшить расстояние между сообщениями'));
  } else if (settingsSection === 'notifications') {
    c.appendChild(el('h2', null, 'Уведомления'));
    block.appendChild(toggleRow('sound', 'Звук уведомлений', 'Проигрывать звук при новых сообщениях'));
    block.appendChild(toggleRow('desktop', 'Системные уведомления', 'Показывать уведомления рабочего стола'));
    block.appendChild(toggleRow('mentions', 'Упоминания', 'Уведомлять при @упоминании'));
    block.appendChild(toggleRow('dnd', 'Не беспокоить', 'Временно отключить все уведомления'));
  } else if (settingsSection === 'privacy') {
    c.appendChild(el('h2', null, 'Приватность'));
    const info = el('div', 'setting-row');
    const l = el('div');
    l.appendChild(el('div', 's-title', 'Аккаунт защищён'));
    l.appendChild(el('div', 's-desc', 'Пароли хранятся в зашифрованном виде (bcrypt). Двухфакторную аутентификацию добавим позже.'));
    info.appendChild(l);
    block.appendChild(info);
  }
  c.appendChild(block);
}

/* ======================= WebSocket ======================= */
function connectWebSocket() {
  const ws = new WebSocket(`${wsBase()}/ws?token=${state.token}`);
  state.ws = ws;
  ws.addEventListener('message', (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    handleWsEvent(msg);
  });
  ws.addEventListener('close', () => { setTimeout(() => { if (state.token) connectWebSocket(); }, 2000); });
}
function sendWs(payload) {
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(payload));
}
function handleWsEvent(msg) {
  switch (msg.type) {
    case 'message': appendMessage(msg.message); break;
    case 'message_updated': handleMessageUpdated(msg.message); break;
    case 'message_deleted': handleMessageDeleted(msg); break;
    case 'reaction_updated': handleReactionUpdated(msg); break;
    case 'presence': setPresence(msg.user.id, msg.online); break;
    case 'member_joined': if (msg.server_id === state.currentServerId) loadMembers(msg.server_id); break;
    case 'member_left': handleMemberLeft(msg); break;
    case 'member_roles_updated':
      if (msg.server_id === state.currentServerId) loadMembers(msg.server_id).then(refreshSettingsIfOpen);
      break;
    case 'roles_updated':
      if (msg.server_id === state.currentServerId) { loadRoles(msg.server_id).then(refreshSettingsIfOpen); loadMembers(msg.server_id); }
      break;
    case 'channel_created': handleChannelCreated(msg); break;
    case 'channel_updated': applyChannelUpdate(msg.server_id, msg.channel); break;
    case 'channel_deleted': removeChannelLocally(msg.server_id, msg.channel_id); break;
    case 'server_channels': if (msg.server_id === state.currentServerId) reloadServerChannels(msg.server_id); break;
    case 'server_updated': applyServerUpdate(msg.server_id, msg.name); break;
    case 'server_deleted': removeServerLocally(msg.server_id); break;
    case 'server_removed': removeServerLocally(msg.server_id); break;
    case 'dm_message': handleDmMessage(msg); break;
    case 'dm_typing': handleDmTyping(msg); break;
    case 'call_offer': handleCallOffer(msg); break;
    case 'call_answer': handleCallAnswer(msg); break;
    case 'call_ice': handleCallIce(msg); break;
    case 'call_decline': handleCallDecline(); break;
    case 'call_busy': handleCallBusy(); break;
    case 'call_end': handleCallEnd(); break;
    case 'typing': showTyping(msg); break;
  }
}

function handleMessageUpdated(upd) {
  const m = msgById.get(upd.id);
  if (!m) return;
  m.content = upd.content;
  m.edited_at = upd.edited_at;
  const row = rowFor(upd.id);
  if (row) fillMessageBody(row, m);
}
function handleMessageDeleted(msg) {
  msgById.delete(msg.message_id);
  const row = rowFor(msg.message_id);
  if (row) row.remove();
}
function handleReactionUpdated(msg) {
  const m = msgById.get(msg.message_id);
  if (!m) return;
  m.reactions = msg.reactions;
  const row = rowFor(msg.message_id);
  if (row) fillMessageBody(row, m);
}
// Refetch the current server's channels as visible to this user (private channels).
async function reloadServerChannels(serverId) {
  try {
    const { server } = await api(`/servers/${serverId}`);
    const s = state.servers.find((x) => x.id === serverId);
    if (!s || !server) return;
    s.channels = server.channels;
    if (serverId === state.currentServerId) {
      renderTree();
      if (state.currentChannelId && !s.channels.find((c) => c.id === state.currentChannelId)) {
        if (s.channels.length) selectChannel(s.channels[0].id);
        else { state.currentChannelId = null; resetChat(); }
      }
      if (!$('server-settings-overlay').classList.contains('hidden')) openServerSettings();
    }
  } catch { /* ignore */ }
}

function handleChannelCreated(msg) {
  const server = state.servers.find((s) => s.id === msg.server_id);
  if (!server) return;
  if (!server.channels.find((c) => c.id === msg.channel.id)) {
    server.channels.push(msg.channel);
    if (msg.server_id === state.currentServerId) renderTree();
  }
}
function showTyping(msg) {
  if (msg.channel_id !== state.currentChannelId) return;
  const key = msg.user.id;
  $('typing').textContent = `${msg.user.username} печатает…`;
  clearTimeout(state.typingTimers[key]);
  state.typingTimers[key] = setTimeout(() => { $('typing').textContent = ''; }, 2500);
}

/* ======================= Modals ======================= */
$('rail-add').addEventListener('click', () => $('modal-overlay').classList.remove('hidden'));
$('modal-close').addEventListener('click', () => $('modal-overlay').classList.add('hidden'));
$('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) $('modal-overlay').classList.add('hidden'); });
document.querySelectorAll('.modal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.modal-body').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
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
    showView('chat');
    selectServer(server.id);
  } catch (err) { $('modal-error').textContent = err.message; }
});
$('join-server-btn').addEventListener('click', async () => {
  const invite_code = $('join-code').value.trim();
  try {
    const { server } = await api('/servers/join', { method: 'POST', body: { invite_code } });
    if (!state.servers.find((s) => s.id === server.id)) state.servers.push(server);
    $('join-code').value = '';
    $('modal-overlay').classList.add('hidden');
    showView('chat');
    selectServer(server.id);
  } catch (err) { $('modal-error').textContent = err.message; }
});

function openChannelModal() {
  $('channel-modal-overlay').classList.remove('hidden');
  $('new-channel-name').focus();
}
$('channel-modal-close').addEventListener('click', () => $('channel-modal-overlay').classList.add('hidden'));
$('channel-modal-overlay').addEventListener('click', (e) => { if (e.target === $('channel-modal-overlay')) $('channel-modal-overlay').classList.add('hidden'); });
$('create-channel-btn').addEventListener('click', async () => {
  const name = $('new-channel-name').value.trim();
  try {
    const { channel } = await api(`/servers/${state.currentServerId}/channels`, { method: 'POST', body: { name } });
    const server = state.servers.find((s) => s.id === state.currentServerId);
    if (server && !server.channels.find((c) => c.id === channel.id)) server.channels.push(channel);
    $('new-channel-name').value = '';
    $('channel-modal-overlay').classList.add('hidden');
    renderTree();
    selectChannel(channel.id);
  } catch (err) { $('channel-modal-error').textContent = err.message; }
});

/* ======================= Server settings ======================= */

// A generic modal dialog built on the fly (for channel/role/member editors).
function openDialog(title, build) {
  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal');
  const close = el('button', 'modal-close'); close.appendChild(icon('x', 'ic ic-sm'));
  const closeFn = () => overlay.remove();
  close.addEventListener('click', closeFn);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeFn(); });
  modal.appendChild(close);
  modal.appendChild(el('h3', 'modal-title', title));
  const body = el('div'); modal.appendChild(body);
  const err = el('div', 'modal-error'); modal.appendChild(err);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  build(body, err, closeFn);
  return closeFn;
}

function memberPosition(m) {
  if (m.owner) return Infinity;
  let p = 0;
  for (const rid of m.role_ids || []) { const r = state.roles.find((x) => x.id === rid); if (r && r.position > p) p = r.position; }
  return p;
}
function canKick(m) {
  return hasPerm(PERM.KICK_MEMBERS) && !m.owner && m.id !== state.user.id && state.myPosition > memberPosition(m);
}

function openServerSettings() {
  const server = state.servers.find((s) => s.id === state.currentServerId);
  if (!server) return;
  const isOwner = state.myOwner;
  const body = $('ss-body');
  body.innerHTML = '';
  $('ss-error').textContent = '';
  const reopen = () => openServerSettings();

  // Rename server (MANAGE_SERVER).
  if (hasPerm(PERM.MANAGE_SERVER)) {
    body.appendChild(el('div', 'field-label', 'Название сервера'));
    const nameRow = el('div', 'ss-inline');
    const nameInput = el('input', 'field-input');
    nameInput.value = server.name; nameInput.maxLength = 40;
    const saveName = el('button', 'btn-mini', 'Сохранить');
    saveName.addEventListener('click', async () => {
      try { await api(`/servers/${server.id}`, { method: 'PATCH', body: { name: nameInput.value.trim() } }); saveName.textContent = 'Готово'; setTimeout(() => (saveName.textContent = 'Сохранить'), 1000); }
      catch (e) { $('ss-error').textContent = e.message; }
    });
    nameRow.appendChild(nameInput); nameRow.appendChild(saveName);
    body.appendChild(nameRow);
  }

  // Channels (MANAGE_CHANNELS) — each opens its own settings dialog.
  if (hasPerm(PERM.MANAGE_CHANNELS)) {
    body.appendChild(el('div', 'field-label', 'Каналы'));
    for (const ch of server.channels) {
      const row = el('div', 'ss-row');
      row.appendChild(Object.assign(el('span', 'ss-member-name', `# ${ch.name}`), {}));
      const gear = el('button', 'btn-mini', 'Настроить');
      gear.addEventListener('click', () => openChannelSettings(ch));
      row.appendChild(gear);
      body.appendChild(row);
    }
  }

  // Roles (MANAGE_ROLES).
  if (hasPerm(PERM.MANAGE_ROLES)) {
    const head = el('div', 'ss-inline'); head.style.justifyContent = 'space-between'; head.style.alignItems = 'center';
    head.appendChild(el('div', 'field-label', 'Роли'));
    const add = el('button', 'btn-mini', '+ Роль');
    add.addEventListener('click', () => openRoleEditor(null));
    head.appendChild(add);
    body.appendChild(head);

    for (const r of state.roles) {
      const row = el('div', 'ss-row');
      const dot = el('span', 'role-dot'); dot.style.background = r.color || '#94a3b8';
      row.appendChild(dot);
      row.appendChild(el('span', 'ss-member-name', r.is_default ? '@everyone' : r.name));
      if (r.position < state.myPosition) {
        const ed = el('button', 'icon-btn'); ed.appendChild(icon('edit', 'ic ic-sm')); ed.title = 'Изменить';
        ed.addEventListener('click', () => openRoleEditor(r));
        row.appendChild(ed);
        if (!r.is_default) {
          const del = el('button', 'icon-btn danger'); del.appendChild(icon('x', 'ic ic-sm')); del.title = 'Удалить роль';
          del.addEventListener('click', async () => {
            if (!confirm(`Удалить роль «${r.name}»?`)) return;
            try { await api(`/roles/${r.id}`, { method: 'DELETE' }); } catch (e) { $('ss-error').textContent = e.message; }
          });
          row.appendChild(del);
        }
      }
      body.appendChild(row);
    }
  }

  // Members (MANAGE_ROLES to assign, KICK_MEMBERS to remove).
  if (hasPerm(PERM.MANAGE_ROLES) || hasPerm(PERM.KICK_MEMBERS)) {
    body.appendChild(el('div', 'field-label', 'Участники'));
    for (const m of state.members) {
      const row = el('div', 'ss-row');
      row.appendChild(avatarEl(m.username, { size: 'sm', avatar: m.avatar }));
      const label = m.owner ? 'Владелец' : (m.top ? m.top.name : 'Участник');
      row.appendChild(el('span', 'ss-member-name', `${m.username} · ${label}`));
      if (hasPerm(PERM.MANAGE_ROLES) && !m.owner) {
        const rolesBtn = el('button', 'btn-mini', 'Роли');
        rolesBtn.addEventListener('click', () => openMemberRoles(m));
        row.appendChild(rolesBtn);
      }
      if (canKick(m)) {
        const kick = el('button', 'btn-mini danger', 'Кик');
        kick.addEventListener('click', async () => {
          if (!confirm(`Исключить ${m.username}?`)) return;
          try { await api(`/servers/${server.id}/members/${m.id}`, { method: 'DELETE' }); } catch (e) { $('ss-error').textContent = e.message; }
        });
        row.appendChild(kick);
      }
      body.appendChild(row);
    }
  }

  // Danger zone.
  if (isOwner) {
    const danger = el('button', 'btn-danger', 'Удалить сервер');
    danger.addEventListener('click', async () => {
      if (!confirm(`Удалить сервер «${server.name}»? Это необратимо.`)) return;
      try { await api(`/servers/${server.id}`, { method: 'DELETE' }); $('server-settings-overlay').classList.add('hidden'); }
      catch (e) { $('ss-error').textContent = e.message; }
    });
    body.appendChild(danger);
  } else {
    if (!hasPerm(PERM.MANAGE_SERVER) && !hasPerm(PERM.MANAGE_CHANNELS) && !hasPerm(PERM.MANAGE_ROLES) && !hasPerm(PERM.KICK_MEMBERS)) {
      body.appendChild(Object.assign(el('p', 's-desc', 'Ты участник этого сервера.'), { style: 'margin:4px 0 16px' }));
    }
    const leave = el('button', 'btn-danger', 'Выйти с сервера');
    leave.addEventListener('click', async () => {
      if (!confirm('Выйти с сервера?')) return;
      try { await api(`/servers/${server.id}/leave`, { method: 'POST' }); removeServerLocally(server.id); $('server-settings-overlay').classList.add('hidden'); }
      catch (e) { $('ss-error').textContent = e.message; }
    });
    body.appendChild(leave);
  }

  $('server-settings-overlay').classList.remove('hidden');
}

// --- channel settings dialog ---
function openChannelSettings(ch) {
  openDialog(`Канал #${ch.name}`, (body, err, close) => {
    body.appendChild(el('div', 'field-label', 'Название'));
    const name = el('input', 'field-input'); name.value = ch.name; name.maxLength = 24;
    body.appendChild(name);
    body.appendChild(el('div', 'field-label', 'Тема канала'));
    const topic = el('textarea', 'edit-input'); topic.value = ch.topic || ''; topic.placeholder = 'О чём этот канал…'; topic.maxLength = 200;
    body.appendChild(topic);

    // Privacy
    const privLine = el('label', 'perm-line'); privLine.style.marginTop = '10px';
    const priv = el('input'); priv.type = 'checkbox'; priv.checked = !!ch.is_private;
    privLine.appendChild(priv); privLine.appendChild(el('span', null, 'Приватный канал (доступ по ролям)'));
    body.appendChild(privLine);

    const rolesWrap = el('div');
    const boxes = {};
    const buildRoles = () => {
      rolesWrap.innerHTML = '';
      if (!priv.checked) return;
      rolesWrap.appendChild(el('div', 'field-label', 'Кому доступен'));
      const roles = state.roles.filter((r) => !r.is_default);
      if (!roles.length) { rolesWrap.appendChild(el('p', 's-desc', 'Создайте роли, чтобы выдать доступ.')); return; }
      for (const r of roles) {
        const line = el('label', 'perm-line');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = (ch.role_ids || []).includes(r.id);
        boxes[r.id] = cb;
        const dot = el('span', 'role-dot'); dot.style.background = r.color || '#94a3b8';
        line.appendChild(cb); line.appendChild(dot); line.appendChild(el('span', null, r.name));
        rolesWrap.appendChild(line);
      }
    };
    priv.addEventListener('change', buildRoles);
    buildRoles();
    body.appendChild(rolesWrap);

    const save = el('button', 'btn-primary', 'Сохранить');
    save.addEventListener('click', async () => {
      const role_ids = priv.checked ? Object.keys(boxes).filter((id) => boxes[id].checked).map(Number) : [];
      try {
        await api(`/channels/${ch.id}`, { method: 'PATCH', body: { name: name.value.trim(), topic: topic.value, is_private: priv.checked, role_ids } });
        close();
      } catch (e) { err.textContent = e.message; }
    });
    body.appendChild(save);
    const del = el('button', 'btn-danger', 'Удалить канал');
    del.addEventListener('click', async () => {
      if (!confirm(`Удалить канал #${ch.name}?`)) return;
      try { await api(`/channels/${ch.id}`, { method: 'DELETE' }); close(); } catch (e) { err.textContent = e.message; }
    });
    body.appendChild(del);
  });
}

// --- role editor dialog (create or edit) ---
function openRoleEditor(role) {
  const editing = !!role;
  openDialog(editing ? `Роль «${role.is_default ? '@everyone' : role.name}»` : 'Новая роль', (body, err, close) => {
    let name, color;
    if (!role || !role.is_default) {
      body.appendChild(el('div', 'field-label', 'Название'));
      name = el('input', 'field-input'); name.value = role ? role.name : ''; name.maxLength = 30; name.placeholder = 'Модератор';
      body.appendChild(name);
      body.appendChild(el('div', 'field-label', 'Цвет'));
      color = el('input'); color.type = 'color'; color.value = (role && role.color) || '#e8a23a'; color.className = 'role-color-input';
      body.appendChild(color);
    }
    body.appendChild(el('div', 'field-label', 'Права'));
    const permBoxes = {};
    for (const [key, label] of PERM_LIST) {
      const line = el('label', 'perm-line');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = role ? !!(role.permissions & PERM[key]) : false;
      permBoxes[key] = cb;
      line.appendChild(cb); line.appendChild(el('span', null, label));
      body.appendChild(line);
    }
    const save = el('button', 'btn-primary', editing ? 'Сохранить' : 'Создать');
    save.addEventListener('click', async () => {
      let permissions = 0;
      for (const [key] of PERM_LIST) if (permBoxes[key].checked) permissions |= PERM[key];
      const payload = { permissions };
      if (name) payload.name = name.value.trim();
      if (color) payload.color = color.value;
      try {
        if (editing) await api(`/roles/${role.id}`, { method: 'PATCH', body: payload });
        else await api(`/servers/${state.currentServerId}/roles`, { method: 'POST', body: payload });
        close();
      } catch (e) { err.textContent = e.message; }
    });
    body.appendChild(save);
  });
}

// --- member role assignment dialog ---
function openMemberRoles(m) {
  openDialog(`Роли · ${m.username}`, (body, err, close) => {
    const assignable = state.roles.filter((r) => !r.is_default && r.position < state.myPosition);
    if (!assignable.length) body.appendChild(el('p', 's-desc', 'Нет ролей, которые ты можешь назначить.'));
    const boxes = {};
    for (const r of assignable) {
      const line = el('label', 'perm-line');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = (m.role_ids || []).includes(r.id);
      boxes[r.id] = cb;
      const dot = el('span', 'role-dot'); dot.style.background = r.color || '#94a3b8';
      line.appendChild(cb); line.appendChild(dot); line.appendChild(el('span', null, r.name));
      body.appendChild(line);
    }
    const save = el('button', 'btn-primary', 'Сохранить');
    save.addEventListener('click', async () => {
      const role_ids = Object.keys(boxes).filter((id) => boxes[id].checked).map(Number);
      try { await api(`/servers/${state.currentServerId}/members/${m.id}/roles`, { method: 'PUT', body: { role_ids } }); close(); }
      catch (e) { err.textContent = e.message; }
    });
    body.appendChild(save);
  });
}
document.querySelector('.sidebar-header').addEventListener('click', () => {
  if (state.currentServerId) openServerSettings();
});
$('ss-close').addEventListener('click', () => $('server-settings-overlay').classList.add('hidden'));
$('server-settings-overlay').addEventListener('click', (e) => { if (e.target === $('server-settings-overlay')) $('server-settings-overlay').classList.add('hidden'); });

// --- local state updates driven by WS events ---
function applyServerUpdate(id, name) {
  const s = state.servers.find((x) => x.id === id);
  if (!s) return;
  s.name = name;
  if (id === state.currentServerId) $('server-name').textContent = name;
  renderRail();
}
function removeServerLocally(id) {
  const idx = state.servers.findIndex((s) => s.id === id);
  if (idx < 0) return;
  state.servers.splice(idx, 1);
  if (state.currentServerId === id) {
    state.currentServerId = null; state.currentChannelId = null;
    if (state.servers.length) { showView('chat'); selectServer(state.servers[0].id); }
    else { renderRail(); renderTree(); resetChat(); $('server-name').textContent = 'Нет серверов'; }
  } else renderRail();
}
function applyChannelUpdate(serverId, channel) {
  const s = state.servers.find((x) => x.id === serverId);
  if (!s) return;
  const ch = s.channels.find((c) => c.id === channel.id);
  if (ch) { ch.name = channel.name; if (channel.topic !== undefined) ch.topic = channel.topic; }
  if (serverId === state.currentServerId) {
    renderTree();
    if (state.currentChannelId === channel.id && ch) {
      $('channel-name').textContent = ch.name;
      $('channel-topic').textContent = ch.topic || ('Канал #' + ch.name);
      $('composer-input').placeholder = 'Написать в #' + ch.name;
    }
  }
}
function removeChannelLocally(serverId, channelId) {
  const s = state.servers.find((x) => x.id === serverId);
  if (!s) return;
  s.channels = s.channels.filter((c) => c.id !== channelId);
  if (serverId === state.currentServerId) {
    if (state.currentChannelId === channelId) {
      if (s.channels.length) selectChannel(s.channels[0].id);
      else { state.currentChannelId = null; renderTree(); resetChat(); }
    } else renderTree();
  }
}
function handleMemberLeft(msg) {
  if (msg.server_id !== state.currentServerId) return;
  loadMembers(msg.server_id).then(() => {
    if (!$('server-settings-overlay').classList.contains('hidden')) openServerSettings();
  });
}
function refreshSettingsIfOpen() {
  if (!$('server-settings-overlay').classList.contains('hidden')) openServerSettings();
  if (state.view === 'chat') renderTree();
}

/* ======================= Direct messages ======================= */
$('logout-btn-dm').addEventListener('click', logout);
$('rail-logo').addEventListener('click', () => showView('dms'));

async function loadDms() {
  try {
    const { threads } = await api('/dms');
    state.dmThreads = threads;
    renderDmList();
  } catch { /* ignore */ }
}

function renderDmList() {
  const box = $('dm-list');
  box.innerHTML = '';
  if (!state.dmThreads.length) {
    box.appendChild(el('div', 'tree-empty', 'Пока нет диалогов. Откройте участника сервера и напишите ему.'));
    return;
  }
  for (const th of state.dmThreads) {
    const row = el('button', 'dm-item' + (th.id === state.currentDmId ? ' active' : ''));
    row.appendChild(avatarEl(th.other.username, { size: 'sm', status: th.other.online ? 'online' : 'offline', avatar: th.other.avatar }));
    const info = el('div', 'dm-item-info');
    info.appendChild(el('div', 'dm-item-name', th.other.username));
    info.appendChild(el('div', 'dm-item-preview', th.preview || 'нет сообщений'));
    row.appendChild(info);
    row.addEventListener('click', () => openDm(th));
    box.appendChild(row);
  }
}

async function startDmWith(userId) {
  try {
    const { thread } = await api('/dms', { method: 'POST', body: { user_id: userId } });
    showView('dms');
    const existing = state.dmThreads.find((t) => t.id === thread.id);
    if (!existing) state.dmThreads.unshift(thread);
    renderDmList();
    openDm(thread);
  } catch (e) { alert(e.message); }
}

let lastDmMsg = null;
async function openDm(thread) {
  state.currentDmId = thread.id;
  state.dmPeer = thread.other;
  renderDmList();

  $('dm-peer-name').textContent = thread.other.username;
  $('dm-peer-status').textContent = thread.other.online ? 'В сети' : 'Не в сети';
  const av = avatarEl(thread.other.username, { size: 'sm', status: thread.other.online ? 'online' : 'offline', avatar: thread.other.avatar });
  av.id = 'dm-peer-avatar';
  $('dm-peer-avatar').replaceWith(av);
  $('dm-input').disabled = false;
  $('dm-input').placeholder = `Написать ${thread.other.username}`;

  const box = $('dm-messages');
  box.innerHTML = '';
  lastDmMsg = null;
  const { messages } = await api(`/dms/${thread.id}/messages`);
  if (!messages.length) {
    const hint = el('div', 'empty-hint');
    hint.appendChild(el('h2', null, thread.other.username));
    hint.appendChild(el('p', null, 'Это начало вашего диалога.'));
    box.appendChild(hint);
    return;
  }
  for (const m of messages) appendDmMessage(m, false);
  dmScrollBottom();
}

function appendDmMessage(m, animate = true) {
  if (m.thread_id !== state.currentDmId) return;
  const box = $('dm-messages');
  const hint = box.querySelector('.empty-hint');
  if (hint) hint.remove();

  const grouped = lastDmMsg && lastDmMsg.user_id === m.user_id && m.created_at - lastDmMsg.created_at < 5 * 60 * 1000;
  const row = el('div', 'msg' + (grouped ? ' grouped' : ''));
  row.appendChild(avatarEl(m.username, { size: 'md', avatar: m.avatar }));
  const body = el('div', 'body');
  const head = el('div', 'head');
  head.appendChild(el('span', 'author', m.username));
  head.appendChild(el('span', 'time', formatTime(m.created_at)));
  body.appendChild(head);
  if (m.content) body.appendChild(el('div', 'text', m.content));
  const att = attachmentEl(m);
  if (att) body.appendChild(att);
  row.appendChild(body);
  box.appendChild(row);
  lastDmMsg = m;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 200;
  if (!animate || nearBottom) dmScrollBottom();
}
function dmScrollBottom() { const b = $('dm-messages'); b.scrollTop = b.scrollHeight; }

function sendDm() {
  const input = $('dm-input');
  const content = input.value.trim();
  if (!content || !state.currentDmId) return;
  sendWs({ type: 'dm_message', thread_id: state.currentDmId, content });
  input.value = '';
}
$('dm-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
  else if (state.currentDmId) sendWs({ type: 'dm_typing', thread_id: state.currentDmId });
});
$('dm-send').addEventListener('click', sendDm);

function handleDmMessage(msg) {
  const m = msg.message;
  // update thread preview / ordering
  const th = state.dmThreads.find((t) => t.id === m.thread_id);
  if (th) { th.preview = m.content; th.last_at = m.created_at; }
  if (state.view === 'dms' && m.thread_id === state.currentDmId) {
    appendDmMessage(m);
  } else {
    // new activity elsewhere — refresh list and flag the rail
    loadDms();
    if (m.user_id !== state.user.id) $('rail-logo').classList.add('has-unread');
  }
  if (state.view === 'dms') renderDmList();
}
function handleDmTyping(msg) {
  if (state.view !== 'dms' || msg.thread_id !== state.currentDmId) return;
  $('dm-typing').textContent = `${msg.user.username} печатает…`;
  clearTimeout(state.typingTimers['dm' + msg.thread_id]);
  state.typingTimers['dm' + msg.thread_id] = setTimeout(() => { $('dm-typing').textContent = ''; }, 2500);
}

/* ======================= Calls (WebRTC, 1:1 in DMs) ======================= */
const call = {
  active: false, threadId: null, peer: null, video: false,
  pc: null, localStream: null, incoming: null, ringTimer: null, outgoing: false,
};

async function loadRtcConfig() {
  try { state.rtcConfig = await api('/rtc-config'); }
  catch { state.rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; }
}

function setCallStatus(t) { $('call-status').textContent = t; }
function useIcon(btn, name) { btn.querySelector('use').setAttribute('href', '#i-' + name); }

function showCallOverlay(peer, video) {
  $('call-remote-name').textContent = peer.username;
  const av = avatarEl(peer.username, { size: 'xl', avatar: peer.avatar }); av.id = 'call-remote-avatar';
  $('call-remote-avatar').replaceWith(av);
  $('call-remote-info').classList.remove('hidden');
  $('ctrl-cam').style.display = video ? '' : 'none';
  $('local-video').classList.add('hidden');
  $('remote-video').srcObject = null;
  $('call-overlay').classList.remove('hidden');
}

function cleanupCall() {
  if (call.ringTimer) { clearTimeout(call.ringTimer); call.ringTimer = null; }
  if (call.pc) { try { call.pc.close(); } catch { /* ignore */ } call.pc = null; }
  if (call.localStream) { call.localStream.getTracks().forEach((t) => t.stop()); call.localStream = null; }
  $('remote-video').srcObject = null;
  $('local-video').srcObject = null;
  $('call-overlay').classList.add('hidden');
  $('incoming-call').classList.add('hidden');
  $('ctrl-mic').classList.remove('off'); useIcon($('ctrl-mic'), 'mic');
  $('ctrl-cam').classList.remove('off'); useIcon($('ctrl-cam'), 'video');
  Object.assign(call, { active: false, threadId: null, peer: null, video: false, incoming: null, outgoing: false });
}

function getLocalStream(video) {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 1280, height: 720 } : false });
}
function attachLocal() {
  if (call.localStream.getVideoTracks().length) {
    $('local-video').srcObject = call.localStream;
    $('local-video').classList.remove('hidden');
  } else $('local-video').classList.add('hidden');
}

function createPc() {
  const pc = new RTCPeerConnection(state.rtcConfig || { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = (e) => { if (e.candidate) sendWs({ type: 'call_ice', thread_id: call.threadId, candidate: e.candidate }); };
  pc.ontrack = (e) => {
    $('remote-video').srcObject = e.streams[0];
    if (e.track.kind === 'video') {
      $('call-remote-info').classList.add('hidden');
      e.track.onmute = () => $('call-remote-info').classList.remove('hidden');
      e.track.onunmute = () => $('call-remote-info').classList.add('hidden');
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') setCallStatus('В разговоре');
    else if (pc.connectionState === 'failed') setCallStatus('Соединение потеряно');
  };
  return pc;
}

async function startCall(video) {
  if (call.active || !state.currentDmId || !state.dmPeer) return;
  let stream;
  try { stream = await getLocalStream(video); }
  catch { alert('Нет доступа к микрофону/камере. Разреши доступ (сайт должен открываться по HTTPS).'); return; }
  Object.assign(call, { active: true, outgoing: true, threadId: state.currentDmId, peer: state.dmPeer, video, localStream: stream });
  showCallOverlay(call.peer, video); setCallStatus('Звоним…'); attachLocal();
  call.pc = createPc();
  for (const t of stream.getTracks()) call.pc.addTrack(t, stream);
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  sendWs({ type: 'call_offer', thread_id: call.threadId, sdp: offer, video });
  call.ringTimer = setTimeout(() => {
    if (call.active && call.outgoing && call.pc && call.pc.connectionState !== 'connected') {
      setCallStatus('Нет ответа');
      sendWs({ type: 'call_end', thread_id: call.threadId });
      setTimeout(cleanupCall, 1200);
    }
  }, 30000);
}

function handleCallOffer(msg) {
  if (call.active) { sendWs({ type: 'call_busy', thread_id: msg.thread_id }); return; }
  call.incoming = { threadId: msg.thread_id, sdp: msg.sdp, from: msg.from, video: !!msg.video };
  $('incoming-name').textContent = msg.from.username;
  $('incoming-sub').textContent = msg.video ? 'Входящий видеозвонок' : 'Входящий звонок';
  const av = avatarEl(msg.from.username, { size: 'lg', avatar: msg.from.avatar }); av.id = 'incoming-avatar';
  $('incoming-avatar').replaceWith(av);
  $('incoming-call').classList.remove('hidden');
}

async function acceptCall() {
  const inc = call.incoming;
  if (!inc) return;
  $('incoming-call').classList.add('hidden');
  let stream;
  try { stream = await getLocalStream(inc.video); }
  catch { alert('Нет доступа к микрофону/камере.'); sendWs({ type: 'call_decline', thread_id: inc.threadId }); call.incoming = null; return; }
  Object.assign(call, { active: true, outgoing: false, threadId: inc.threadId, peer: inc.from, video: inc.video, localStream: stream, incoming: null });
  showCallOverlay(call.peer, inc.video); setCallStatus('Соединение…'); attachLocal();
  call.pc = createPc();
  for (const t of stream.getTracks()) call.pc.addTrack(t, stream);
  await call.pc.setRemoteDescription(new RTCSessionDescription(inc.sdp));
  const answer = await call.pc.createAnswer();
  await call.pc.setLocalDescription(answer);
  sendWs({ type: 'call_answer', thread_id: call.threadId, sdp: answer });
}

function declineCall() {
  if (call.incoming) { sendWs({ type: 'call_decline', thread_id: call.incoming.threadId }); call.incoming = null; }
  $('incoming-call').classList.add('hidden');
}

async function handleCallAnswer(msg) {
  if (!call.active || !call.pc) return;
  await call.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  if (call.ringTimer) { clearTimeout(call.ringTimer); call.ringTimer = null; }
  setCallStatus('Соединение…');
}
async function handleCallIce(msg) {
  if (call.pc && msg.candidate) { try { await call.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch { /* ignore */ } }
}
function handleCallDecline() { if (call.active && call.outgoing) { setCallStatus('Звонок отклонён'); setTimeout(cleanupCall, 1200); } }
function handleCallBusy() { if (call.active && call.outgoing) { setCallStatus('Занято'); setTimeout(cleanupCall, 1200); } }
function handleCallEnd() {
  if (call.active) { setCallStatus('Звонок завершён'); setTimeout(cleanupCall, 800); }
  else { $('incoming-call').classList.add('hidden'); call.incoming = null; }
}
function endCall() { if (call.threadId) sendWs({ type: 'call_end', thread_id: call.threadId }); cleanupCall(); }

$('ctrl-mic').addEventListener('click', () => {
  const t = call.localStream && call.localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('ctrl-mic').classList.toggle('off', !t.enabled);
  useIcon($('ctrl-mic'), t.enabled ? 'mic' : 'mic-off');
});
$('ctrl-cam').addEventListener('click', () => {
  const t = call.localStream && call.localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('ctrl-cam').classList.toggle('off', !t.enabled);
  useIcon($('ctrl-cam'), t.enabled ? 'video' : 'video-off');
  $('local-video').classList.toggle('hidden', !t.enabled);
});
$('ctrl-hangup').addEventListener('click', endCall);
$('incoming-accept').addEventListener('click', acceptCall);
$('incoming-decline').addEventListener('click', declineCall);
$('dm-call-audio').addEventListener('click', () => startCall(false));
$('dm-call-video').addEventListener('click', () => startCall(true));

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
