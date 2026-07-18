/* ============================================================
 *  ФЕЛАР: СЕРДЦЕ МШИСТОГО ЛЕСА
 *  2D-платформер на чистом Canvas. Ассеты: Blue Wizard, Slimes,
 *  Mossy Tileset, Raven Fantasy Icons.
 * ============================================================ */
'use strict';

const W = 960, H = 540;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

/* ---------------- Масштабирование сцены ---------------- */
const stage = document.getElementById('stage');
function fitStage() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
}
window.addEventListener('resize', fitStage);
fitStage();

/* ---------------- Загрузка ассетов ---------------- */
const IMG = {};
let MANIFEST = {};

function loadAssets() {
  return fetch('assets/manifest.json')
    .then(r => r.json())
    .then(man => {
      MANIFEST = man;
      const names = Object.keys(man);
      let done = 0;
      return new Promise(resolve => {
        names.forEach(n => {
          const im = new Image();
          im.onload = im.onerror = () => {
            IMG[n] = im;
            drawLoadBar(++done / names.length);
            if (done === names.length) resolve();
          };
          im.src = `assets/${n}.png`;
        });
      });
    });
}

function drawLoadBar(p) {
  ctx.fillStyle = '#0b1d16';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9fd4b4';
  ctx.font = '20px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('Фелар пробуждается…', W / 2, H / 2 - 24);
  ctx.strokeStyle = 'rgba(140,220,170,.4)';
  ctx.strokeRect(W / 2 - 150, H / 2, 300, 14);
  ctx.fillStyle = '#46e08a';
  ctx.fillRect(W / 2 - 147, H / 2 + 3, 294 * p, 8);
}

/* Тонированные копии фоновых силуэтов для параллакса */
const TINTED = {};
function makeTinted() {
  const layers = [ ['far', 'rgba(16,42,34,0.92)'], ['mid', 'rgba(24,62,46,0.75)'] ];
  for (let i = 0; i <= 5; i++) {
    const src = IMG['bg' + i];
    if (!src) continue;
    for (const [suffix, color] of layers) {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      TINTED[`bg${i}_${suffix}`] = c;
    }
  }
}

/* ---------------- Звук (WebAudio-синтез) ---------------- */
const SND = {
  ctx: null, on: JSON.parse(localStorage.getItem('felar_sound') ?? 'true'),
  master: null, padNodes: [],
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
      this.startPad();
    } catch (e) { /* без звука */ }
  },
  toggle() {
    this.on = !this.on;
    localStorage.setItem('felar_sound', JSON.stringify(this.on));
    if (this.master) this.master.gain.value = this.on ? 0.5 : 0;
    return this.on;
  },
  startPad() {
    // тихий лесной фон: два детюненных треугольника + шум ветра
    const c = this.ctx, t = c.currentTime;
    const padGain = c.createGain(); padGain.gain.value = 0.05; padGain.connect(this.master);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(padGain.gain); lfo.start(t);
    [[65.4, -6], [98, 5]].forEach(([f, det]) => {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      o.connect(padGain); o.start(t);
      this.padNodes.push(o);
    });
    const noise = c.createBufferSource();
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = c.createGain(); ng.gain.value = 0.012;
    noise.connect(nf); nf.connect(ng); ng.connect(this.master); noise.start(t);
    // редкие «светлячковые» ноты
    const scale = [392, 466, 523, 587, 698];
    const chime = () => {
      if (!this.ctx) return;
      if (this.on && game.state === 'play' && Math.random() < 0.5) {
        const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < .3 ? 2 : 1);
        this.blip(f, 0.6, 'sine', 0.04);
      }
      setTimeout(chime, 1500 + Math.random() * 3000);
    };
    setTimeout(chime, 2000);
  },
  blip(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  sJump()  { this.blip(280, 0.14, 'square', 0.10, 620); },
  sDash()  { this.noise(0.18, 0.22, 2000); this.blip(700, 0.16, 'sawtooth', 0.06, 180); },
  sGem()   { this.blip(880, 0.12, 'sine', 0.14); setTimeout(() => this.blip(1318, 0.25, 'sine', 0.12), 70); },
  sStomp() { this.blip(200, 0.12, 'sine', 0.22, 55); },
  sBoing() { this.blip(160, 0.3, 'triangle', 0.2, 620); },
  sPop()   { this.noise(0.1, 0.25, 700); this.blip(260, 0.1, 'triangle', 0.15, 120); },
  sHurt()  { this.blip(220, 0.28, 'sawtooth', 0.18, 70); },
  sHeal()  { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.1), i * 80)); },
  sDoor()  { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 'sine', 0.1), i * 110)); },
  sPortal(){ this.blip(392, 0.8, 'sine', 0.12); this.blip(494, 0.8, 'sine', 0.10); this.blip(587, 0.9, 'sine', 0.10); },
  sClick() { this.blip(660, 0.05, 'square', 0.06); },
};

/* ---------------- Ввод ---------------- */
const keys = {};
const input = { left: false, right: false, jumpHeld: false, jumpBuf: 0, dashReq: false };

window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jumpBuf = 0.12;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') input.dashReq = true;
  if (e.code === 'Escape') game.onEscape();
  if (e.code === 'Enter' && game.state === 'story') game.storyNext();
  SND.init();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { if (game.state === 'play') game.pause(); });

function pollInput() {
  input.left = !!(keys['ArrowLeft'] || keys['KeyA'] || touchState.left);
  input.right = !!(keys['ArrowRight'] || keys['KeyD'] || touchState.right);
  input.jumpHeld = !!(keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || touchState.jump);
}

/* Сенсорное управление */
const touchState = { left: false, right: false, jump: false };
const touchEl = document.getElementById('touch');
function bindTouch(id, down, up) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); SND.init(); down(); });
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}
bindTouch('tLeft', () => touchState.left = true, () => touchState.left = false);
bindTouch('tRight', () => touchState.right = true, () => touchState.right = false);
bindTouch('tJump', () => { touchState.jump = true; input.jumpBuf = 0.12; }, () => touchState.jump = false);
bindTouch('tDash', () => input.dashReq = true, () => {});
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/* ---------------- Коллайдеры спрайтов ---------------- */
/* xi — отступ слева/справа (доля ширины), top — где проходит поверхность (доля высоты) */
const COLL = {
  hill1: { xi: .06, top: .20 }, hill2: { xi: .10, top: .20 }, hill3: { xi: .08, top: .15 },
  hill4: { xi: .10, top: .22 }, hill5: { xi: .12, top: .26 }, hill6: { xi: .08, top: .20 },
  plat0: { xi: .10, top: .18 }, plat1: { xi: .05, top: .16 }, plat2: { xi: .10, top: .07 },
  plat3: { xi: .08, top: .18 }, plat4: { xi: .05, top: .16 }, plat5: { xi: .10, top: .18 },
  plat6: { xi: .04, top: .15 }, plat7: { xi: .03, top: .15 },
  deco0: { xi: .12, top: .30 }, deco1: { xi: .10, top: .28 },
};

/* ---------------- Вспомогательные ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function drawSheet(name, frame, x, y, flip = false, alpha = 1, scale = 1) {
  const m = MANIFEST[name]; if (!m) return;
  const fw = m.fw, fh = m.fh;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(IMG[name], frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
  ctx.restore();
}

/* ---------------- Частицы ---------------- */
let particles = [];
function spawnP(x, y, opts = {}) {
  particles.push({
    x, y,
    vx: opts.vx ?? (Math.random() - 0.5) * 120,
    vy: opts.vy ?? (Math.random() - 0.5) * 120,
    t: 0, life: opts.life ?? 0.6,
    size: opts.size ?? 3,
    col: opts.col ?? '#8fe6b2',
    grav: opts.grav ?? 0,
    glow: opts.glow ?? false,
  });
}
function burst(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * (opts.speed ?? 160);
    spawnP(x, y, { ...opts, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up ?? 0) });
  }
}
function updParticles(dt) {
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
  }
  particles = particles.filter(p => p.t < p.life);
}
function drawParticles(camX, camY) {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = k;
    if (p.glow) { ctx.shadowColor = p.col; ctx.shadowBlur = 12; }
    ctx.fillStyle = p.col;
    const s = p.size * (0.5 + k * 0.5);
    ctx.fillRect(p.x - camX - s / 2, p.y - camY - s / 2, s, s);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/* ---------------- Светлячки ---------------- */
let fireflies = [];
function initFireflies(width) {
  fireflies = [];
  for (let i = 0; i < Math.min(46, width / 110); i++) {
    fireflies.push({
      x: Math.random() * width, y: 60 + Math.random() * 420,
      ph: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.7,
    });
  }
}
function drawFireflies(t, camX, camY, alpha = 1) {
  for (const f of fireflies) {
    const x = f.x + Math.sin(t * f.sp + f.ph) * 26 - camX;
    const y = f.y + Math.cos(t * f.sp * 0.8 + f.ph * 2) * 18 - camY;
    if (x < -20 || x > W + 20) continue;
    const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + f.ph * 3);
    ctx.globalAlpha = tw * 0.85 * alpha;
    ctx.shadowColor = '#b8ffcf'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#d8ffe6';
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/* ============================================================
 *  ИГРА
 * ============================================================ */
const game = {
  state: 'boot',       // boot | menu | story | play | pause | gameover | victory
  levelIndex: 0,
  time: 0,             // общее игровое время
  deaths: 0,
  totalGems: 0,
  storyPages: [], storyAt: 0, storyDone: null,
  banner: null,        // {text, t}
  fade: 0, fadeDir: 0, fadeCb: null,

  level: null,         // построенный уровень
  player: null,
  slimes: [], gems: [], potions: [],
  camX: 0, camY: 0,
  shake: 0,

  onEscape() {
    if (this.state === 'play') this.pause();
    else if (this.state === 'pause') this.resume();
  },
  pause() { if (this.state !== 'play') return; this.state = 'pause'; UI.showPause(); },
  resume() { this.state = 'play'; UI.clear(); },

  startFade(cb) { this.fadeDir = 1; this.fadeCb = cb; },

  /* ---------- Построение уровня ---------- */
  buildLevel(idx) {
    const data = LEVELS[idx];
    this.levelIndex = idx;
    const L = {
      data, width: data.width,
      solids: [], oneways: [], hazards: [],
      islands: [], thorns: [], decos: [], vines: [], hints: data.hints || [],
      portal: { x: data.portal[0], y: data.portal[1], t: 0, active: false },
      bgFar: [], bgMid: [],
    };
    for (const [s, cx, sy, mode] of data.islands) {
      const m = MANIFEST[s], c = COLL[s] || { xi: .08, top: .18 };
      const dx = cx - m.w / 2, dy = sy - m.h * c.top;
      L.islands.push({ s, x: dx, y: dy });
      const rect = { x: dx + m.w * c.xi, y: sy, w: m.w * (1 - 2 * c.xi), h: m.h - m.h * c.top };
      if (mode === 'solid') L.solids.push(rect); else L.oneways.push(rect);
    }
    for (const [s, x, by] of data.thorns || []) {
      const m = MANIFEST[s];
      L.thorns.push({ s, x: x - m.w / 2, y: by - m.h });
      L.hazards.push({ x: x - m.w / 2 + m.w * .16, y: by - m.h + m.h * .22, w: m.w * .68, h: m.h * .72 });
    }
    for (const [s, x, by] of data.decos || []) {
      const m = MANIFEST[s];
      L.decos.push({ s, x: x - m.w / 2, y: by - m.h });
    }
    for (const [s, x, ty] of data.vines || []) {
      const m = MANIFEST[s];
      L.vines.push({ s, x: x - m.w / 2, y: ty, ph: Math.random() * 6 });
    }
    L.aplants = (data.aplants || []).map(([s, x, by]) => ({ s, x, y: by, ph: Math.random() * 6 }));
    L.poisons = (data.poisons || []).map(([x, by]) => {
      const m = MANIFEST.plant_poison;
      L.hazards.push({ x: x - m.fw * 0.30, y: by - m.fh * 0.66, w: m.fw * 0.60, h: m.fh * 0.62 });
      return { x, y: by, ph: Math.random() * 6 };
    });
    // параллакс-фон: детерминированная генерация
    let seed = 1234 + idx * 777;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = -200; x < data.width * 0.5 + 600; x += 260 + rnd() * 240) {
      const i = 2 + ((rnd() * 4) | 0);
      L.bgFar.push({ s: `bg${i}_far`, x, y: 400 + rnd() * 120, sc: 0.8 + rnd() * 0.7 });
    }
    seed = 999 + idx * 333;
    for (let x = -200; x < data.width * 0.75 + 600; x += 340 + rnd() * 300) {
      const i = 2 + ((rnd() * 4) | 0);
      L.bgMid.push({ s: `bg${i}_mid`, x, y: 460 + rnd() * 140, sc: 0.9 + rnd() * 0.8 });
    }
    this.level = L;

    /* сущности */
    this.player = {
      x: data.start.x, y: data.start.y, vx: 0, vy: 0, w: 40, h: 96,
      onGround: false, coyote: 0, facing: 1,
      dashT: 0, dashCd: 0, dashDir: 1,
      inv: 0, hp: 3, animT: 0,
      spawnX: data.start.x, spawnY: data.start.y,
      squash: 0,
    };
    this.slimes = (data.slimes || []).map(([x, y, type, r]) => ({
      x, y, type, x0: x - r, x1: x + r,
      vx: (type === 'o' ? 85 : 55) * (Math.random() < .5 ? 1 : -1),
      animT: Math.random() * 2, dead: 0,
    }));
    this.gems = (data.gems || []).map(([x, y]) => ({ x, y, taken: false, ph: Math.random() * 6 }));
    this.potions = (data.potions || []).map(([x, y]) => ({ x, y, taken: false, ph: Math.random() * 6 }));
    this.tramps = (data.tramps || []).map(([x, y]) => ({ x, y, t: -1 }));
    this.checkpoints = (data.checkpoints || []).map(([x, y]) => ({ x, y, on: false, ph: Math.random() * 6 }));
    this.checkpoint = { x: data.start.x, y: data.start.y };
    this.camX = clamp(data.start.x - W / 2, 0, data.width - W);
    this.camY = 0;
    particles = [];
    initFireflies(data.width);
    this.banner = { text: data.name, t: 0 };
    UI.updateHud();
    UI.setLevelName(`${idx + 1} · ${data.name}`);
  },

  startLevel(idx) {
    this.buildLevel(idx);
    this.state = 'play';
    UI.clear();
    UI.showHud(true);
    if (IS_TOUCH) touchEl.classList.remove('hidden');
  },

  /* ---------- Сюжетные страницы ---------- */
  showStory(pages, done) {
    this.state = 'story';
    this.storyPages = pages; this.storyAt = 0; this.storyDone = done;
    UI.showHud(false);
    UI.showStoryPage(pages[0], 0, pages.length);
  },
  storyNext() {
    SND.sClick();
    this.storyAt++;
    if (this.storyAt >= this.storyPages.length) {
      const cb = this.storyDone; this.storyDone = null;
      UI.clear(); cb && cb();
    } else {
      UI.showStoryPage(this.storyPages[this.storyAt], this.storyAt, this.storyPages.length);
    }
  },

  /* ---------- Урон/смерть ---------- */
  hurt(fromX = null) {
    const p = this.player;
    if (p.inv > 0 || p.dashT > 0) return;
    p.hp--; p.inv = 1.3;
    this.shake = 0.35;
    SND.sHurt();
    burst(p.x, p.y - 40, 14, { col: '#ff8a80', speed: 200, life: 0.5 });
    UI.updateHud();
    if (p.hp <= 0) { this.die(); return; }
    if (fromX !== null) {
      p.vx = (p.x < fromX ? -1 : 1) * 320; p.vy = -380;
    }
  },
  /* Падение в бездну: возрождение обязательно, даже под неуязвимостью */
  pitFall() {
    const p = this.player;
    if (p.inv <= 0) {
      p.hp--;
      this.shake = 0.35;
      SND.sHurt();
      UI.updateHud();
      if (p.hp <= 0) { this.die(); return; }
    }
    p.inv = 1.3;
    p.x = p.spawnX; p.y = p.spawnY - 4;
    p.vx = 0; p.vy = 0; p.dashT = 0;
    burst(p.x, p.y - 40, 12, { col: '#9fdcff', speed: 140, life: 0.5, glow: true });
  },
  die() {
    this.deaths++;
    this.state = 'gameover';
    SND.blip(150, 0.9, 'sawtooth', 0.15, 40);
    UI.showGameOver();
  },
  /* возрождение у последнего синего цветка: осколки сохраняются */
  reviveAtCheckpoint() {
    const p = this.player;
    p.hp = 3; p.inv = 2; p.vx = 0; p.vy = 0; p.dashT = 0;
    p.x = this.checkpoint.x; p.y = this.checkpoint.y - 4;
    p.spawnX = p.x; p.spawnY = this.checkpoint.y;
    this.state = 'play';
    UI.clear(); UI.updateHud();
    burst(p.x, p.y - 50, 16, { col: '#8fd8ff', speed: 150, life: 0.6, glow: true });
  },

  levelComplete() {
    SND.sPortal();
    this.startFade(() => {
      const next = this.levelIndex + 1;
      if (next >= LEVELS.length) {
        localStorage.setItem('felar_best', '1');
        this.state = 'victory';
        UI.showHud(false); touchEl.classList.add('hidden');
        this.showStory(STORY.victory, () => UI.showVictory());
      } else {
        localStorage.setItem('felar_progress', String(next));
        const key = next === 1 ? 'level2' : 'level3';
        this.showStory(STORY[key], () => this.startLevel(next));
      }
    });
  },

  /* ---------- Обновление ---------- */
  update(dt) {
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3) this.banner = null; }
    if (this.fadeDir === 1) {
      this.fade = Math.min(1, this.fade + dt * 2.4);
      if (this.fade >= 1) { this.fadeDir = -1; const cb = this.fadeCb; this.fadeCb = null; cb && cb(); }
    } else if (this.fadeDir === -1) {
      this.fade = Math.max(0, this.fade - dt * 2.4);
      if (this.fade <= 0) this.fadeDir = 0;
    }
    if (this.state !== 'play') { input.dashReq = false; return; }

    const p = this.player, L = this.level;
    pollInput();

    /* --- герой --- */
    p.animT += dt;
    p.coyote = Math.max(0, p.coyote - dt);
    input.jumpBuf = Math.max(0, input.jumpBuf - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.inv = Math.max(0, p.inv - dt);
    p.squash = Math.max(0, p.squash - dt * 3);

    if (input.dashReq) {
      input.dashReq = false;
      if (p.dashCd <= 0 && p.dashT <= 0) {
        p.dashT = 0.20; p.dashCd = 0.9;
        p.dashDir = input.left && !input.right ? -1 : input.right && !input.left ? 1 : p.facing;
        p.facing = p.dashDir;
        SND.sDash();
        burst(p.x, p.y - 45, 10, { col: '#7fd4ff', speed: 120, life: 0.35, glow: true });
      }
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDir * 760;
      p.vy = 0;
      if (Math.random() < 0.7) spawnP(p.x - p.dashDir * 20, p.y - 40 - Math.random() * 40,
        { vx: -p.dashDir * 60, vy: (Math.random() - .5) * 40, col: '#9fdcff', life: 0.3, size: 4, glow: true });
    } else {
      const acc = p.onGround ? 2600 : 1700;
      const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (target !== 0) {
        p.vx = clamp(p.vx + target * acc * dt, -340, 340);
        p.facing = target;
      } else {
        const dec = (p.onGround ? 2200 : 700) * dt;
        p.vx = Math.abs(p.vx) <= dec ? 0 : p.vx - Math.sign(p.vx) * dec;
      }
      p.vy = Math.min(p.vy + 2300 * dt, 1050);
      if (p.vy >= 0) p.launched = false;
      if (!input.jumpHeld && p.vy < -260 && !p.launched) p.vy = -260; // короткий прыжок (не режет батут)
    }

    if (input.jumpBuf > 0 && (p.onGround || p.coyote > 0) && p.dashT <= 0) {
      input.jumpBuf = 0; p.coyote = 0;
      p.vy = -830; p.onGround = false; p.squash = 0.3;
      SND.sJump();
      burst(p.x, p.y, 6, { col: '#bcd9c4', speed: 60, up: 30, life: 0.35, grav: 300 });
    }

    /* движение + коллизии */
    const wasBottom = p.y;
    const vyBefore = p.vy;
    p.x += p.vx * dt;
    let box = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
    for (const r of L.solids) {
      if (aabb(box, r)) {
        if (p.vx > 0 && box.x + box.w - r.x < 40) { p.x = r.x - p.w / 2; if (p.dashT > 0) p.dashT = 0; }
        else if (p.vx < 0 && r.x + r.w - box.x < 40) { p.x = r.x + r.w + p.w / 2; if (p.dashT > 0) p.dashT = 0; }
        box = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
      }
    }
    p.y += p.vy * dt;
    const wasGround = p.onGround;
    p.onGround = false;
    box = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
    for (const r of L.solids) {
      if (aabb(box, r)) {
        if (p.vy >= 0 && wasBottom <= r.y + 14) {
          p.y = r.y; p.vy = 0; p.onGround = true;
        } else if (p.vy < 0 && box.y - (r.y + r.h) > -30) {
          p.y = r.y + r.h + p.h; p.vy = 0;
        }
        box = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
      }
    }
    for (const r of L.oneways) {
      if (p.vy >= 0 && wasBottom <= r.y + 10 && aabb(box, r)) {
        p.y = r.y; p.vy = 0; p.onGround = true;
        box = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
      }
    }
    if (p.onGround) {
      p.coyote = 0.1;
      if (!wasGround) {
        p.squash = 0.35;
        burst(p.x, p.y, 5, { col: '#bcd9c4', speed: 50, up: 10, life: 0.3, grav: 250 });
      }
      p.spawnX = p.x; p.spawnY = p.y;
    }
    p.x = clamp(p.x, p.w / 2, L.width - p.w / 2);

    /* падение в бездну */
    if (p.y > 720) { this.pitFall(); if (this.state !== 'play') return; }

    /* шипы и ядовитые цветы */
    const pbox = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
    for (const hz of L.hazards) {
      if (p.inv <= 0 && p.dashT <= 0 && aabb(pbox, hz)) {
        this.hurt(hz.x + hz.w / 2); break;
      }
    }

    /* батуты */
    for (const tr of this.tramps) {
      if (tr.t >= 0) { tr.t += dt; if (tr.t > 0.55) tr.t = -1; }
      const tb = { x: tr.x - 40, y: tr.y - 70, w: 80, h: 70 };
      if (vyBefore > 120 && aabb(pbox, tb)) {
        p.vy = -1150; p.onGround = false; p.coyote = 0; p.squash = 0.4;
        p.launched = true;
        tr.t = 0;
        SND.sBoing();
        burst(tr.x, tr.y - 40, 12, { col: '#5fe0d0', speed: 160, life: 0.5, glow: true });
      }
    }

    /* синие цветы-чекпоинты */
    for (const cp of this.checkpoints) {
      if (cp.on) continue;
      if (Math.abs(p.x - cp.x) < 52 && Math.abs(p.y - cp.y) < 100) {
        cp.on = true;
        this.checkpoint = { x: cp.x, y: cp.y };
        if (p.hp < 3) { p.hp++; UI.updateHud(); }
        SND.sHeal();
        this.banner = { text: 'Цветок запомнил тебя', t: 0.5 };
        burst(cp.x, cp.y - 70, 20, { col: '#8fd8ff', speed: 170, life: 0.7, glow: true, up: 60 });
      }
    }

    /* --- слаймы --- */
    for (const s of this.slimes) {
      if (s.dead > 0) { s.dead += dt; continue; }
      s.animT += dt;
      s.x += s.vx * dt;
      if (s.x < s.x0) { s.x = s.x0; s.vx = Math.abs(s.vx); }
      if (s.x > s.x1) { s.x = s.x1; s.vx = -Math.abs(s.vx); }
      const sw = s.type === 'o' ? 82 : 64, sh = s.type === 'o' ? 56 : 44;
      const sbox = { x: s.x - sw / 2, y: s.y - sh, w: sw, h: sh };
      if (!aabb(pbox, sbox)) continue;

      if (p.dashT > 0) {
        s.dead = 0.001; this.shake = 0.15;
        SND.sPop();
        burst(s.x, s.y - sh / 2, 16, { col: s.type === 'o' ? '#ffb74d' : '#9ccc65', speed: 220, life: 0.5, grav: 400 });
      } else if (p.vy > 140 && (p.y - s.y + sh) < sh * 0.9 && s.type === 'g') {
        s.dead = 0.001;
        p.vy = -520; p.squash = 0.3;
        SND.sStomp();
        burst(s.x, s.y - sh / 2, 12, { col: '#9ccc65', speed: 180, life: 0.45, grav: 400 });
      } else {
        this.hurt(s.x);
        if (this.state !== 'play') return;
      }
    }
    this.slimes = this.slimes.filter(s => s.dead < 0.6);

    /* --- осколки и зелья --- */
    for (const g of this.gems) {
      if (g.taken) continue;
      if (Math.abs(p.x - g.x) < 42 && Math.abs((p.y - p.h / 2) - g.y) < 60) {
        g.taken = true;
        SND.sGem();
        burst(g.x, g.y, 14, { col: '#6fe3ff', speed: 160, life: 0.6, glow: true });
        UI.updateHud();
        if (this.gems.every(x => x.taken)) {
          SND.sDoor();
          this.banner = { text: 'Портал открыт!', t: 0 };
        }
      }
    }
    for (const pt of this.potions) {
      if (pt.taken) continue;
      if (Math.abs(p.x - pt.x) < 40 && Math.abs((p.y - p.h / 2) - pt.y) < 56) {
        pt.taken = true;
        SND.sHeal();
        if (p.hp < 3) p.hp++;
        burst(pt.x, pt.y, 12, { col: '#ff8a80', speed: 120, life: 0.5, glow: true });
        UI.updateHud();
      }
    }

    /* --- портал --- */
    const portal = L.portal;
    portal.t += dt;
    portal.active = this.gems.every(g => g.taken);
    if (portal.active && Math.abs(p.x - portal.x) < 44 && Math.abs(p.y - portal.y) < 90 && this.fadeDir === 0) {
      this.totalGems += this.gems.length;
      this.levelComplete();
    }

    /* --- камера --- */
    const tx = clamp(p.x - W / 2, 0, L.width - W);
    const ty = clamp(p.y - H * 0.62, -140, 60);
    this.camX = lerp(this.camX, tx, 1 - Math.pow(0.0012, dt));
    this.camY = lerp(this.camY, ty, 1 - Math.pow(0.004, dt));
    this.shake = Math.max(0, this.shake - dt);

    updParticles(dt);
    UI.setDashCd(p.dashCd / 0.9);
  },

  /* ---------- Отрисовка ---------- */
  draw() {
    const t = this.time;
    if (this.state === 'menu' || this.state === 'boot' ||
        (this.state === 'story' && !this.level) ||
        (this.state === 'victory')) {
      this.drawMenuScene(t);
      return;
    }
    if (!this.level) return;
    const L = this.level;
    let camX = this.camX, camY = this.camY;
    if (this.shake > 0) {
      camX += (Math.random() - .5) * this.shake * 22;
      camY += (Math.random() - .5) * this.shake * 22;
    }

    this.drawSky();

    /* параллакс */
    for (const b of L.bgFar) {
      const im = TINTED[b.s]; if (!im) continue;
      const x = b.x - camX * 0.22, y = b.y - camY * 0.15;
      if (x + im.width * b.sc * .5 < -80 || x - im.width * b.sc * .5 > W + 80) continue;
      ctx.drawImage(im, x - im.width * b.sc / 2, y - im.height * b.sc, im.width * b.sc, im.height * b.sc);
    }
    ctx.fillStyle = 'rgba(10,26,20,0.35)';
    ctx.fillRect(0, 0, W, H);
    for (const b of L.bgMid) {
      const im = TINTED[b.s]; if (!im) continue;
      const x = b.x - camX * 0.5, y = b.y - camY * 0.35;
      if (x + im.width * b.sc * .5 < -80 || x - im.width * b.sc * .5 > W + 80) continue;
      ctx.drawImage(im, x - im.width * b.sc / 2, y - im.height * b.sc, im.width * b.sc, im.height * b.sc);
    }

    drawFireflies(t, camX * 0.8, camY * 0.8, 0.5);

    /* лианы */
    for (const v of L.vines) {
      const im = IMG[v.s]; if (!im) continue;
      const x = v.x - camX, y = v.y - camY;
      if (x + im.width < -40 || x > W + 40) continue;
      ctx.save();
      ctx.translate(x + im.width / 2, y);
      ctx.rotate(Math.sin(t * 0.8 + v.ph) * 0.03);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(im, -im.width / 2, 0);
      ctx.restore();
    }

    /* острова */
    for (const isl of L.islands) {
      const im = IMG[isl.s];
      const x = isl.x - camX, y = isl.y - camY;
      if (x + im.width < -60 || x > W + 60) continue;
      ctx.drawImage(im, x, y);
    }
    /* шипы */
    for (const th of L.thorns) {
      const im = IMG[th.s];
      const x = th.x - camX, y = th.y - camY;
      if (x + im.width < -60 || x > W + 60) continue;
      ctx.drawImage(im, x, y);
    }
    /* декорации */
    for (const d of L.decos) {
      const im = IMG[d.s];
      const x = d.x - camX, y = d.y - camY;
      if (x + im.width < -60 || x > W + 60) continue;
      ctx.drawImage(im, x, y);
    }
    /* анимированные растения */
    for (const ap of L.aplants) {
      const x = ap.x - camX;
      if (x < -80 || x > W + 80) continue;
      const m = MANIFEST[ap.s];
      drawSheet(ap.s, ((t * 12 + ap.ph * 3) | 0) % m.frames, x, ap.y - camY + 2);
    }
    /* ядовитые цветы */
    for (const po of L.poisons) {
      const x = po.x - camX;
      if (x < -90 || x > W + 90) continue;
      const m = MANIFEST.plant_poison;
      drawSheet('plant_poison', ((t * 13 + po.ph) | 0) % m.frames, x, po.y - camY + 2);
    }
    /* батуты */
    for (const tr of this.tramps) {
      const x = tr.x - camX;
      if (x < -80 || x > W + 80) continue;
      const fr = tr.t >= 0 ? Math.min(19, (tr.t * 40) | 0) : 0;
      drawSheet('plant_jump', fr, x, tr.y - camY + 2);
    }
    /* цветы-чекпоинты */
    for (const cp of this.checkpoints) {
      const x = cp.x - camX;
      if (x < -90 || x > W + 90) continue;
      const m = MANIFEST.blueflower;
      ctx.shadowColor = '#7fd4ff';
      ctx.shadowBlur = cp.on ? 20 + Math.sin(t * 3) * 8 : 6;
      drawSheet('blueflower', ((t * 13 + cp.ph * 4) | 0) % m.frames, x, cp.y - camY + 2, false, cp.on ? 1 : 0.85);
      ctx.shadowBlur = 0;
      if (cp.on && Math.random() < 0.06) {
        spawnP(cp.x + (Math.random() - .5) * 50, cp.y - 60 - Math.random() * 50,
          { vx: 0, vy: -30, col: '#8fd8ff', life: 1, size: 2, glow: true });
      }
    }

    /* подсказки */
    ctx.font = '15px Georgia';
    ctx.textAlign = 'center';
    for (const [hx, hy, text] of L.hints) {
      const x = hx - camX, y = hy - camY;
      if (x < -220 || x > W + 220) continue;
      const lines = text.split('\n');
      const wMax = Math.max(...lines.map(l => ctx.measureText(l).width)) + 28;
      const hBox = lines.length * 20 + 16;
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#0a1a12';
      ctx.beginPath(); ctx.roundRect(x - wMax / 2, y - hBox / 2, wMax, hBox, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(140,220,170,.35)'; ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#cdeeda';
      lines.forEach((l, i) => ctx.fillText(l, x, y - hBox / 2 + 24 + i * 20));
      ctx.globalAlpha = 1;
    }

    this.drawPortal(camX, camY, t);

    /* осколки и зелья */
    for (const g of this.gems) {
      if (g.taken) continue;
      const y = g.y + Math.sin(t * 2.4 + g.ph) * 7;
      ctx.shadowColor = '#6fe3ff'; ctx.shadowBlur = 16;
      ctx.drawImage(IMG.ic_gem, g.x - 17 - camX, y - 17 - camY, 34, 34);
      ctx.shadowBlur = 0;
    }
    for (const pt of this.potions) {
      if (pt.taken) continue;
      const y = pt.y + Math.sin(t * 2 + pt.ph) * 6;
      ctx.shadowColor = '#ff6e60'; ctx.shadowBlur = 12;
      ctx.drawImage(IMG.ic_potion, pt.x - 16 - camX, y - 16 - camY, 32, 32);
      ctx.shadowBlur = 0;
    }

    /* слаймы */
    for (const s of this.slimes) {
      const name = s.type === 'o' ? 'slime_orange' : 'slime_green';
      const m = MANIFEST[name];
      const fr = ((s.animT * 20) | 0) % m.frames;
      if (s.dead > 0) {
        const k = 1 - s.dead / 0.6;
        ctx.save();
        ctx.translate(s.x - camX, s.y - camY);
        ctx.scale(1 + (1 - k) * 0.6, Math.max(0.08, k));
        ctx.globalAlpha = k;
        ctx.drawImage(IMG[name], fr * m.fw, 0, m.fw, m.fh, -m.fw / 2, -m.fh, m.fw, m.fh);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        drawSheet(name, fr, s.x - camX, s.y - camY + 4, s.vx > 0);
      }
    }

    /* герой */
    this.drawPlayer(camX, camY);

    drawParticles(camX, camY);
    drawFireflies(t, camX, camY, 1);

    /* виньетка + туман глубины */
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,8,5,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    /* баннер уровня */
    if (this.banner) {
      const bt = this.banner.t;
      const a = bt < 0.5 ? bt * 2 : bt > 2.3 ? Math.max(0, 1 - (bt - 2.3) / 0.7) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dffbe9';
      ctx.font = '32px Georgia';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#46e08a'; ctx.shadowBlur = 18;
      ctx.fillText(this.banner.text, W / 2, 120);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (this.fade > 0) {
      ctx.fillStyle = `rgba(3,10,6,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  },

  drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const idx = this.level ? this.levelIndex : 0;
    const tops = ['#123227', '#0f2c26', '#0c2020'];
    const mids = ['#1b4a36', '#173f38', '#122e2c'];
    g.addColorStop(0, tops[idx] || tops[0]);
    g.addColorStop(0.55, mids[idx] || mids[0]);
    g.addColorStop(1, '#071510');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // мягкое свечение "сердца леса" на горизонте
    const gl = ctx.createRadialGradient(W * 0.5, H * 0.42, 20, W * 0.5, H * 0.42, 420);
    gl.addColorStop(0, 'rgba(90,200,140,0.10)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);
  },

  drawPortal(camX, camY, t) {
    const p = this.level.portal;
    const x = p.x - camX, y = p.y - camY - 52;
    const act = p.active;
    ctx.save();
    ctx.translate(x, y);
    const glow = act ? 0.85 + 0.15 * Math.sin(t * 4) : 0.35 + 0.08 * Math.sin(t * 2);
    for (let i = 0; i < 3; i++) {
      const r = 44 - i * 9 + Math.sin(t * (2 + i) + i * 2) * 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.72, r, Math.sin(t * 0.7 + i) * 0.25, 0, Math.PI * 2);
      ctx.strokeStyle = act ? `rgba(111,227,255,${glow * (1 - i * 0.22)})` : `rgba(120,180,150,${glow * (1 - i * 0.25)})`;
      ctx.lineWidth = act ? 3 : 2;
      ctx.shadowColor = act ? '#6fe3ff' : '#4a8a6a';
      ctx.shadowBlur = act ? 18 : 6;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (act) {
      const gy = Math.sin(t * 2.6) * 6;
      ctx.shadowColor = '#6fe3ff'; ctx.shadowBlur = 20;
      ctx.drawImage(IMG.ic_gem_amber, -14, -14 + gy, 28, 28);
      ctx.shadowBlur = 0;
      if (Math.random() < 0.3) spawnP(p.x + (Math.random() - .5) * 60, p.y - 20 - Math.random() * 70,
        { vx: 0, vy: -40 - Math.random() * 40, col: '#8ff0ff', life: 0.8, size: 3, glow: true });
    }
    ctx.restore();
    /* пьедестал-надпись */
    if (!act) {
      const left = this.gems.filter(g => !g.taken).length;
      ctx.font = '13px Georgia';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(190,235,205,0.55)';
      ctx.fillText(`ещё ${left} оскол${left === 1 ? 'ок' : left < 5 ? 'ка' : 'ков'}`, x, y - 64);
    }
  },

  drawPlayer(camX, camY) {
    const p = this.player;
    if (p.inv > 0 && this.state === 'play' && ((p.inv * 12) | 0) % 2 === 0) return;
    let name, frame;
    const m140 = 140;
    if (p.dashT > 0) {
      name = 'wiz_dash';
      frame = clamp(((0.20 - p.dashT) / 0.20 * 16) | 0, 0, 15);
    } else if (!p.onGround) {
      name = 'wiz_jump';
      frame = p.vy < 0 ? clamp((3 - (-p.vy / 830) * 3) | 0, 0, 3) : clamp(4 + (p.vy / 700 * 3) | 0, 4, 7);
    } else if (Math.abs(p.vx) > 20) {
      name = 'wiz_walk';
      frame = ((p.animT * 26) | 0) % MANIFEST.wiz_walk.frames;
    } else {
      name = 'wiz_idle';
      frame = ((p.animT * 16) | 0) % MANIFEST.wiz_idle.frames;
    }
    const sq = p.squash;
    ctx.save();
    ctx.translate(p.x - camX, p.y - camY + 9);
    if (sq > 0) ctx.scale(1 + sq * 0.15, 1 - sq * 0.18);
    if (p.facing < 0) ctx.scale(-1, 1);
    const m = MANIFEST[name];
    ctx.drawImage(IMG[name], frame * m.fw, 0, m.fw, m.fh, -m.fw / 2, -m140, m.fw, m.fh);
    ctx.restore();
  },

  /* ---------- Сцена меню ---------- */
  menuSlimeT: 0,
  drawMenuScene(t) {
    this.drawSky();
    // силуэты
    const sil = [ ['bg5_far', 130, 470, 1.1], ['bg3_far', 500, 430, 1.3], ['bg2_far', 830, 460, 1.2],
                  ['bg4_mid', 300, 520, 1.1], ['bg2_mid', 700, 540, 0.9] ];
    for (const [s, x, y, sc] of sil) {
      const im = TINTED[s]; if (!im) continue;
      ctx.drawImage(im, x - im.width * sc / 2, y - im.height * sc, im.width * sc, im.height * sc);
    }
    drawFireflies(t, 0, 0, 0.8);
    // остров с героем
    const hill = IMG.hill1;
    if (hill) ctx.drawImage(hill, W / 2 - hill.width / 2, 440 - 30);
    const vy = 445;
    if (MANIFEST.wiz_idle) {
      const m = MANIFEST.wiz_idle;
      const fr = ((t * 16) | 0) % m.frames;
      ctx.drawImage(IMG.wiz_idle, fr * m.fw, 0, m.fw, m.fh, W / 2 - 30 - m.fw / 2, vy - 140, m.fw, m.fh);
    }
    if (MANIFEST.slime_green) {
      const m = MANIFEST.slime_green;
      const fr = ((t * 20) | 0) % m.frames;
      const sx = W / 2 + 90 + Math.sin(t * 0.7) * 30;
      ctx.save();
      ctx.translate(sx, vy + 4);
      if (Math.cos(t * 0.7) < 0) ctx.scale(-1, 1);
      ctx.drawImage(IMG.slime_green, fr * m.fw, 0, m.fw, m.fh, -m.fw / 2, -m.fh, m.fw, m.fh);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,8,5,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(3,10,6,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  },
};

/* ============================================================
 *  UI (DOM-оверлеи)
 * ============================================================ */
const UI = {
  overlay: document.getElementById('overlay'),
  hud: document.getElementById('hud'),
  clear() { this.overlay.innerHTML = ''; },
  showHud(v) { this.hud.classList.toggle('hidden', !v); },
  setLevelName(t) { document.getElementById('levelName').textContent = t; },

  btn(label, cb, cls = '') {
    const b = document.createElement('button');
    b.className = 'mbtn ' + cls;
    b.textContent = label;
    b.onclick = () => { SND.init(); SND.sClick(); cb(); };
    return b;
  },

  panel(cls) {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel ' + cls;
    this.overlay.appendChild(p);
    return p;
  },

  showMenu() {
    game.state = 'menu';
    this.showHud(false);
    touchEl.classList.add('hidden');
    const p = this.panel('');
    const t = document.createElement('div');
    t.className = 'gameTitle'; t.textContent = 'ФЕЛАР';
    const s = document.createElement('div');
    s.className = 'gameSub'; s.textContent = 'Сердце Мшистого Леса';
    const btns = document.createElement('div'); btns.className = 'menuBtns';
    const prog = parseInt(localStorage.getItem('felar_progress') || '0', 10);
    btns.appendChild(this.btn('Новая игра', () => {
      localStorage.setItem('felar_progress', '0');
      game.time = 0; game.deaths = 0; game.totalGems = 0;
      game.startFade(() => game.showStory(STORY.intro, () => game.startLevel(0)));
    }));
    if (prog > 0 && prog < LEVELS.length) {
      btns.appendChild(this.btn(`Продолжить — уровень ${prog + 1}`, () => {
        game.startFade(() => game.startLevel(prog));
      }));
    }
    btns.appendChild(this.btn('Управление', () => this.showControls(), 'ghost'));
    btns.appendChild(this.btn(`Звук: ${SND.on ? 'вкл' : 'выкл'}`, () => { SND.toggle(); this.showMenu(); }, 'ghost small'));
    p.append(t, s, btns);
    const hint = document.createElement('div');
    hint.className = 'hintKeys';
    hint.textContent = 'основано на ассетах: Blue Wizard · Slimes · Mossy Tileset · Raven Fantasy Icons';
    p.appendChild(hint);
  },

  showControls() {
    const p = this.panel('dim');
    const box = document.createElement('div');
    box.className = 'storyBox';
    box.innerHTML = '<div class="stitle">Управление</div>';
    const g = document.createElement('div');
    g.className = 'ctrlGrid';
    g.innerHTML = `
      <kbd>← →</kbd><span>или <b>A D</b> — движение</span>
      <kbd>ПРОБЕЛ</kbd><span>или <b>W / ↑</b> — прыжок (держи дольше — выше)</span>
      <kbd>SHIFT</kbd><span>или <b>K</b> — рывок: проходит сквозь врагов и шипы</span>
      <kbd>ESC</kbd><span>пауза</span>`;
    box.appendChild(g);
    const tips = document.createElement('p');
    tips.style.marginTop = '22px'; tips.style.fontSize = '17px';
    tips.innerHTML = 'Зелёных слаймов можно топтать сверху.<br>Оранжевые — колючие: только рывок!<br>Синие цветы — чекпоинты, прыгучие растения — батуты.<br>Собери все осколки Сердца и войди в портал.';
    box.appendChild(tips);
    p.appendChild(box);
    p.appendChild(this.btn('Назад', () => this.showMenu()));
  },

  showStoryPage(page, at, total) {
    const p = this.panel('dim');
    p.style.cursor = 'pointer';
    const box = document.createElement('div');
    box.className = 'storyBox';
    if (page.title) box.innerHTML = `<div class="stitle">${page.title}</div>`;
    const tx = document.createElement('p');
    tx.textContent = page.text;
    box.appendChild(tx);
    const dots = document.createElement('div');
    dots.className = 'hintKeys';
    dots.textContent = `${'●'.repeat(at + 1)}${'○'.repeat(total - at - 1)}   —   щёлкни или ENTER`;
    p.append(box, dots);
    p.onclick = () => game.storyNext();
  },

  showPause() {
    const p = this.panel('dim');
    const box = document.createElement('div');
    box.className = 'storyBox';
    box.innerHTML = '<div class="stitle">Пауза</div>';
    const btns = document.createElement('div'); btns.className = 'menuBtns';
    btns.appendChild(this.btn('Продолжить', () => game.resume()));
    btns.appendChild(this.btn('Заново уровень', () => { game.buildLevel(game.levelIndex); game.resume(); }, 'ghost'));
    btns.appendChild(this.btn(`Звук: ${SND.on ? 'вкл' : 'выкл'}`, () => { SND.toggle(); this.showPause(); }, 'ghost small'));
    btns.appendChild(this.btn('В меню', () => this.showMenu(), 'ghost small'));
    p.append(box, btns);
  },

  showGameOver() {
    const p = this.panel('dim');
    const m = document.createElement('div');
    m.className = 'bigMsg bad'; m.textContent = 'Лес померк…';
    const s = document.createElement('div');
    s.className = 'storyBox';
    s.textContent = 'Но пока жив хранитель — жива и надежда.';
    const btns = document.createElement('div'); btns.className = 'menuBtns';
    btns.appendChild(this.btn('Возродиться у цветка', () => game.reviveAtCheckpoint()));
    btns.appendChild(this.btn('Заново уровень', () => {
      game.buildLevel(game.levelIndex);
      game.state = 'play'; this.clear();
    }, 'ghost'));
    btns.appendChild(this.btn('В меню', () => this.showMenu(), 'ghost small'));
    p.append(m, s, btns);
  },

  showVictory() {
    game.state = 'victory';
    const p = this.panel('solid');
    const m = document.createElement('div');
    m.className = 'bigMsg good'; m.textContent = '✦ Сердце спасено ✦';
    const s = document.createElement('div');
    s.className = 'storyBox';
    const mins = Math.floor(game.time / 60), secs = Math.floor(game.time % 60);
    s.innerHTML = `Осколков собрано: <b>${game.totalGems}</b><br>Падений: <b>${game.deaths}</b><br>Время пути: <b>${mins}:${String(secs).padStart(2, '0')}</b>`;
    const btns = document.createElement('div'); btns.className = 'menuBtns';
    btns.appendChild(this.btn('В меню', () => this.showMenu()));
    p.append(m, s, btns);
  },

  updateHud() {
    const hearts = document.getElementById('hearts');
    if (hearts.children.length !== 3) {
      hearts.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const im = document.createElement('img');
        im.src = 'assets/ic_heart.png';
        hearts.appendChild(im);
      }
    }
    const hp = game.player ? game.player.hp : 3;
    [...hearts.children].forEach((im, i) => im.classList.toggle('lost', i >= hp));
    const taken = game.gems.filter(g => g.taken).length;
    document.getElementById('gemCount').textContent = `${taken}/${game.gems.length}`;
  },
  setDashCd(k) {
    document.getElementById('dashCd').style.setProperty('--cd', `${Math.round(k * 100)}%`);
  },
};

/* ============================================================
 *  Главный цикл
 * ============================================================ */
let lastT = 0;
function loop(ts) {
  const dt = Math.min((ts - lastT) / 1000 || 0.016, 1 / 30);
  lastT = ts;
  game.update(dt);
  game.draw();
  requestAnimationFrame(loop);
}

loadAssets().then(() => {
  makeTinted();
  UI.showMenu();
  requestAnimationFrame(loop);
});
