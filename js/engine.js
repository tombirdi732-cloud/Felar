"use strict";
// ============================================================
// Движок: аниматор, камера, частицы, звук, утилиты
// ============================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// детерминированный псевдослучай для декора
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
};
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------- Аниматор ----------------
class Animator {
  constructor(sheetName) {
    this.sheetName = sheetName;
    this.anim = null;
    this.t = 0;
    this.frame = 0;
    this.done = false;
  }
  get sheet() { return Assets.sheet(this.sheetName); }
  set(name, restart = false) {
    if (this.anim === name && !restart) return;
    this.anim = name;
    this.t = 0;
    this.frame = 0;
    this.done = false;
  }
  update(dt) {
    const s = this.sheet;
    if (!s || !this.anim) return;
    const a = s.anims[this.anim];
    if (!a) return;
    this.t += dt;
    let f = Math.floor(this.t * a.fps);
    if (a.loop) f %= a.frames;
    else if (f >= a.frames) { f = a.frames - 1; this.done = true; }
    this.frame = f;
  }
  // x,y — центр по горизонтали, y — НИЖНЯЯ граница спрайта
  draw(ctx, x, y, flip = false, alpha = 1) {
    const s = this.sheet;
    if (!s || !this.anim) return;
    const a = s.anims[this.anim];
    if (!a) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(
      s.img,
      this.frame * s.fw, a.row * s.fh, s.fw, s.fh,
      -s.fw / 2, -s.fh, s.fw, s.fh
    );
    ctx.restore();
  }
}

// ---------------- Камера ----------------
class Camera {
  constructor() { this.x = 0; this.y = 0; this.shake = 0; }
  follow(tx, ty, dt, worldW, worldH) {
    const k = Math.min(1, dt * 6);
    this.x = lerp(this.x, tx - VIEW_W / 2, k);
    this.y = lerp(this.y, ty - VIEW_H * 0.58, k);
    this.x = clamp(this.x, 0, Math.max(0, worldW - VIEW_W));
    this.y = clamp(this.y, -TILE * 2, Math.max(0, worldH - VIEW_H));
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
  }
  kick(v) { this.shake = Math.max(this.shake, v); }
  ox() { return this.x + (this.shake ? (Math.random() - 0.5) * this.shake : 0); }
  oy() { return this.y + (this.shake ? (Math.random() - 0.5) * this.shake : 0); }
}

// ---------------- Частицы ----------------
const Particles = (() => {
  let list = [];
  function spawn(x, y, opts = {}) {
    const n = opts.n || 6;
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined
        ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1)
        : Math.random() * Math.PI * 2;
      const sp = (opts.speed || 80) * (0.4 + Math.random() * 0.8);
      list.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: opts.gravity !== undefined ? opts.gravity : 300,
        life: (opts.life || 0.5) * (0.6 + Math.random() * 0.7),
        t: 0,
        size: (opts.size || 4) * (0.6 + Math.random() * 0.8),
        color: opts.color || "#ffffff",
        glow: !!opts.glow,
      });
    }
  }
  function update(dt) {
    list = list.filter((p) => {
      p.t += dt;
      if (p.t >= p.life) return false;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return true;
    });
  }
  function draw(ctx) {
    for (const p of list) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
  return { spawn, update, draw, clear: () => (list = []) };
})();

// ---------------- Звук (процедурные SFX через WebAudio) ----------------
const SFX = (() => {
  let ac = null;
  function unlock() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ac = null; }
    }
    if (ac && ac.state === "suspended") ac.resume();
  }
  function beep(f0, f1, dur, type = "square", vol = 0.12) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.1) {
    if (!ac) return;
    const t = ac.currentTime;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g).connect(ac.destination);
    src.start(t);
  }
  return {
    unlock,
    jump:   () => beep(300, 560, 0.12, "square", 0.08),
    djump:  () => beep(420, 760, 0.14, "square", 0.08),
    dash:   () => { beep(700, 220, 0.16, "sawtooth", 0.09); noise(0.1, 0.05); },
    pickup: () => { beep(880, 1320, 0.09, "sine", 0.1); beep(1320, 1760, 0.12, "sine", 0.07); },
    hurt:   () => { beep(220, 90, 0.22, "sawtooth", 0.12); },
    stomp:  () => { beep(180, 60, 0.14, "square", 0.12); noise(0.08, 0.06); },
    check:  () => { beep(520, 780, 0.15, "sine", 0.1); beep(780, 1040, 0.2, "sine", 0.08); },
    portal: () => { beep(260, 1040, 0.5, "sine", 0.1); },
    blip:   () => beep(600, 620, 0.03, "square", 0.05),
    death:  () => { beep(400, 60, 0.6, "sawtooth", 0.1); },
    land:   () => noise(0.06, 0.05),
  };
})();
