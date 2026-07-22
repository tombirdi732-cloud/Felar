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
function avatarEl(name, { size = 'md', status } = {}) {
  const wrap = el('div', 'avatar ' + size);
  const c = el('div', 'avatar-circle', initials(name));
  c.style.backgroundColor = colorFor(name);
  wrap.appendChild(c);
  if (status) {
    const d = el('span', 'dot ' + status);
    wrap.appendChild(d);
  }
  return wrap;
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
  const meAv = avatarEl(state.user.username, { size: 'sm', status: 'online' });
  meAv.id = 'me-avatar';
  $('me-avatar').replaceWith(meAv);
  $('nav-profile').innerHTML = '';
  $('nav-profile').appendChild(avatarEl(state.user.username, { size: 'sm', status: 'online' }));

  await loadServers();
  connectWebSocket();
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
  renderRail();
  $('server-name').textContent = server.name;
  renderTree();
  loadMembers(serverId);
  if (server.channels.length) selectChannel(server.channels[0].id);
  else { state.currentChannelId = null; resetChat(); }
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
  if (server.owner_id === state.user.id) {
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
  $('channel-topic').textContent = `Канал #${channel.name}`;
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

function canModerate() {
  const server = state.servers.find((s) => s.id === state.currentServerId);
  return server && server.owner_id === state.user.id;
}

// (Re)build the body of a message row from its data.
function fillMessageBody(row, m) {
  const body = row.querySelector('.body');
  body.innerHTML = '';

  const head = el('div', 'head');
  head.appendChild(el('span', 'author', m.username));
  head.appendChild(el('span', 'time', formatTime(m.created_at)));
  body.appendChild(head);

  const textWrap = el('div', 'text');
  textWrap.appendChild(document.createTextNode(m.content));
  if (m.edited_at) {
    const ed = el('span', 'edited', ' (изменено)');
    textWrap.appendChild(ed);
  }
  body.appendChild(textWrap);

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
  if (m.user_id === state.user.id || canModerate()) {
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
  row.appendChild(avatarEl(m.username, { size: 'md' }));
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
  const server = state.servers.find((s) => s.id === state.currentServerId);
  const roleOf = (m) => (server && m.id === server.owner_id ? 'Владелец' : 'Участник');
  const online = state.members.filter((m) => m.online);
  const offline = state.members.filter((m) => !m.online);

  const section = (title, list, isOnline) => {
    if (!list.length) return;
    box.appendChild(el('div', 'members-heading', `${title} — ${list.length}`));
    for (const m of list) {
      const row = el('div', 'member' + (isOnline ? '' : ' offline'));
      row.appendChild(avatarEl(m.username, { size: 'sm', status: isOnline ? 'online' : 'offline' }));
      const info = el('div');
      info.style.minWidth = '0';
      info.appendChild(el('div', 'm-name', m.username));
      info.appendChild(el('div', 'm-role', roleOf(m)));
      row.appendChild(info);
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
  $('profile-view').classList.toggle('hidden', v !== 'profile');
  $('settings-view').classList.toggle('hidden', v !== 'settings');
  $('sidebar').classList.toggle('hidden', v !== 'chat');
  $('nav-settings').classList.toggle('active', v === 'settings');
  renderRail();
  if (v === 'profile') renderProfile();
  if (v === 'settings') renderSettings();
}
$('nav-settings').addEventListener('click', () => showView('settings'));
$('nav-profile').addEventListener('click', () => showView('profile'));
document.querySelectorAll('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.goto)));

function renderProfile() {
  $('profile-name').textContent = state.user.username;
  $('profile-handle').textContent = state.user.username.toLowerCase().replace(/\s+/g, '.');
  $('stat-servers').textContent = state.servers.length;
  const av = avatarEl(state.user.username, { size: 'xl', status: 'online' });
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
    card.appendChild(avatarEl(state.user.username, { size: 'lg', status: 'online' }));
    const info = el('div');
    info.appendChild(el('div', 's-title', state.user.username));
    info.appendChild(el('div', 's-desc', '@' + state.user.username.toLowerCase().replace(/\s+/g, '.')));
    card.appendChild(info);
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
    case 'channel_created': handleChannelCreated(msg); break;
    case 'channel_updated': applyChannelUpdate(msg.server_id, msg.channel); break;
    case 'channel_deleted': removeChannelLocally(msg.server_id, msg.channel_id); break;
    case 'server_updated': applyServerUpdate(msg.server_id, msg.name); break;
    case 'server_deleted': removeServerLocally(msg.server_id); break;
    case 'server_removed': removeServerLocally(msg.server_id); break;
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
function openServerSettings() {
  const server = state.servers.find((s) => s.id === state.currentServerId);
  if (!server) return;
  const isOwner = server.owner_id === state.user.id;
  const body = $('ss-body');
  body.innerHTML = '';
  $('ss-error').textContent = '';

  if (isOwner) {
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

    body.appendChild(el('div', 'field-label', 'Каналы'));
    for (const ch of server.channels) {
      const row = el('div', 'ss-row');
      const inp = el('input', 'ss-row-input'); inp.value = ch.name;
      const rn = el('button', 'icon-btn'); rn.appendChild(icon('edit', 'ic ic-sm')); rn.title = 'Переименовать';
      rn.addEventListener('click', async () => {
        try { await api(`/channels/${ch.id}`, { method: 'PATCH', body: { name: inp.value.trim() } }); }
        catch (e) { $('ss-error').textContent = e.message; }
      });
      const del = el('button', 'icon-btn danger'); del.appendChild(icon('x', 'ic ic-sm')); del.title = 'Удалить канал';
      del.addEventListener('click', async () => {
        if (!confirm(`Удалить канал #${ch.name}?`)) return;
        try { await api(`/channels/${ch.id}`, { method: 'DELETE' }); openServerSettings(); }
        catch (e) { $('ss-error').textContent = e.message; }
      });
      row.appendChild(inp); row.appendChild(rn); row.appendChild(del);
      body.appendChild(row);
    }

    body.appendChild(el('div', 'field-label', 'Участники'));
    for (const m of state.members) {
      const row = el('div', 'ss-row');
      row.appendChild(avatarEl(m.username, { size: 'sm' }));
      row.appendChild(el('span', 'ss-member-name', m.username + (m.id === server.owner_id ? ' · владелец' : '')));
      if (m.id !== server.owner_id) {
        const kick = el('button', 'btn-mini danger', 'Кик');
        kick.addEventListener('click', async () => {
          if (!confirm(`Исключить ${m.username}?`)) return;
          try { await api(`/servers/${server.id}/members/${m.id}`, { method: 'DELETE' }); loadMembers(server.id).then(() => openServerSettings()); }
          catch (e) { $('ss-error').textContent = e.message; }
        });
        row.appendChild(kick);
      }
      body.appendChild(row);
    }

    const danger = el('button', 'btn-danger', 'Удалить сервер');
    danger.addEventListener('click', async () => {
      if (!confirm(`Удалить сервер «${server.name}»? Это необратимо.`)) return;
      try { await api(`/servers/${server.id}`, { method: 'DELETE' }); $('server-settings-overlay').classList.add('hidden'); }
      catch (e) { $('ss-error').textContent = e.message; }
    });
    body.appendChild(danger);
  } else {
    const p = el('p', 's-desc', 'Ты участник этого сервера.'); p.style.margin = '4px 0 16px';
    body.appendChild(p);
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
  if (ch) ch.name = channel.name;
  if (serverId === state.currentServerId) {
    renderTree();
    if (state.currentChannelId === channel.id) {
      $('channel-name').textContent = channel.name;
      $('channel-topic').textContent = 'Канал #' + channel.name;
      $('composer-input').placeholder = 'Написать в #' + channel.name;
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
