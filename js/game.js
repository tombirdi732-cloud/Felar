"use strict";
// ============================================================
// ИСКРА — основной цикл игры, состояния, рендер, UI
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let RENDER_SCALE = 1; // канвас рендерится в нативном разрешении экрана

// ---------- сохранение ----------
const Save = {
  data: { unlocked: 1, best: {} },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.data = Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* приватный режим и т.п. */ }
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },
};
Save.load();

// ---------- состояние игры ----------
const G = {
  state: "loading",   // loading | menu | chapters | play | end
  chapter: 1,
  level: null,
  player: null,
  moth: null,
  camera: new Camera(),
  enemies: [],
  flyers: [],
  platforms: [],
  shards: [],
  checkpoints: [],
  triggers: [],
  portal: null,
  respawn: { x: 0, y: 0 },
  shardsGot: 0,
  shardsTotal: 0,
  time: 0,
  titleT: 0,
  fade: 1,            // 1 = чёрный экран, 0 = чисто
  fadeDir: -1,
  fadeCb: null,
  dialogue: null,     // {lines, idx, chars}
  paused: false,
  menuIdx: 0,
  chapterDone: false,
  endT: 0,
  loadProgress: 0,
};

function fadeTo(cb) { G.fadeDir = 1; G.fadeCb = cb; }

// ---------- запуск главы ----------
function startChapter(ch) {
  G.chapter = ch;
  G.level = new Level(ch);
  const meta = G.level.meta;
  G.enemies = []; G.flyers = []; G.platforms = [];
  G.shards = []; G.checkpoints = []; G.triggers = [];
  G.portal = null;
  Particles.clear();
  for (const s of G.level.spawns) {
    const cx = s.x + TILE / 2;
    if (s.char === "P") {
      G.respawn = { x: s.x, y: s.y };
      G.player = new Player(s.x, s.y, meta.abilities);
      G.moth = new Moth(cx, s.y);
    } else if (s.char === "o") G.shards.push(new Shard(cx, s.y + TILE / 2));
    else if (s.char === "K") G.checkpoints.push(new Checkpoint(cx, s.y + TILE * 2));
    else if (s.char === "X") G.portal = new Portal(cx, s.y + TILE * 2);
    else if (s.char === "E") G.enemies.push(new Walker(s.x + 8, s.y, meta.enemies.E));
    else if (s.char === "F") G.flyers.push(new Flyer(s.x, s.y, meta.enemies.F));
    else if (s.char === "M") G.platforms.push(new MovingPlatform(s.x, s.y + 8, false));
    else if (s.char === "W") G.platforms.push(new MovingPlatform(s.x, s.y + 8, true));
    else if (/[1-9]/.test(s.char))
      G.triggers.push({ id: +s.char, x: s.x - TILE, y: 0, w: TILE * 3, h: ROWS * TILE, seen: false });
  }
  G.shardsGot = 0;
  G.shardsTotal = G.shards.length;
  G.time = 0;
  G.titleT = 0;
  G.chapterDone = false;
  G.camera.x = 0; G.camera.y = 0;
  G.state = "play";
  G.paused = false;
  G.dialogue = null;
}

// ---------- диалоги ----------
function openDialogue(lines) {
  G.dialogue = { lines, idx: 0, chars: 0 };
  SFX.blip();
}
function updateDialogue(dt) {
  const d = G.dialogue;
  const line = d.lines[d.idx];
  if (d.chars < line.text.length) {
    d.chars = Math.min(line.text.length, d.chars + dt * 40);
    if (Math.random() < dt * 18) SFX.blip();
  }
  if (Input.hit("interact") || Input.hit("jump")) {
    if (d.chars < line.text.length) d.chars = line.text.length;
    else if (++d.idx >= d.lines.length) G.dialogue = null;
    else d.chars = 0;
  }
}

// ---------- игровой апдейт ----------
function updatePlay(dt) {
  G.titleT += dt;

  if (Input.hit("pause")) G.paused = !G.paused;
  if (G.paused) {
    if (Input.hit("quit")) fadeTo(() => { G.state = "chapters"; });
    if (Input.hit("interact")) G.paused = false;
    return;
  }
  if (G.dialogue) {
    updateDialogue(dt);
    G.moth.update(dt, G.player, true);
    return;
  }

  G.time += dt;
  const p = G.player, lvl = G.level;

  for (const mp of G.platforms) mp.update(dt);
  p.update(dt, lvl);

  G.moth.update(dt, p, false);
  for (const e of G.enemies) e.update(dt, lvl);
  for (const f of G.flyers) f.update(dt);
  for (const s of G.shards) s.update(dt);
  for (const c of G.checkpoints) c.update(dt);
  if (G.portal) G.portal.update(dt);
  Particles.update(dt);

  if (!p.dead) {
    // шипы
    if (lvl.spikesHit(p.rect)) p.hurt(-p.facing);
    // падение в пропасть
    if (p.y > lvl.phh + 60) p.die();

    // враги
    const hitEnemy = (e) => {
      if (!e.alive) return;
      const r = p.rect, er = e.rect;
      if (!aabb(r, er)) return;
      if (p.vy > 60 && p.bottom - er.y < 18) {
        e.squash();
        p.vy = PHYS.stompBounce;
        p.jumps = 0;
        G.camera.kick(4);
      } else {
        p.hurt(p.cx < er.x + er.w / 2 ? -1 : 1);
      }
    };
    G.enemies.forEach(hitEnemy);
    G.flyers.forEach(hitEnemy);

    // осколки: магнит + подбор
    for (const s of G.shards) {
      if (s.taken) continue;
      const dx = p.cx - s.x, dy = p.y + p.h / 2 - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 80) {
        s.x += (dx / d) * 380 * dt;
        s.y += (dy / d) * 380 * dt;
      }
      if (aabb(p.rect, s.rect)) { s.take(); G.shardsGot++; }
    }
    // чекпоинты
    for (const c of G.checkpoints) {
      if (!c.lit && aabb(p.rect, c.rect)) {
        c.light();
        G.respawn = { x: c.x - p.w / 2, y: c.y - 70 };
      }
    }
    // триггеры диалогов
    for (const t of G.triggers) {
      if (!t.seen && aabb(p.rect, t)) {
        t.seen = true;
        const lines = (DIALOGUES[G.chapter] || {})[t.id];
        if (lines) openDialogue(lines);
      }
    }
    // врата
    if (G.portal && aabb(p.rect, G.portal.rect) && !G.chapterDone) {
      G.chapterDone = true;
      SFX.portal();
      const best = Save.data.best[G.chapter] || {};
      Save.data.best[G.chapter] = {
        shards: Math.max(best.shards || 0, G.shardsGot),
        total: G.shardsTotal,
        time: best.time ? Math.min(best.time, G.time) : G.time,
      };
      Save.data.unlocked = Math.max(Save.data.unlocked, Math.min(3, G.chapter + 1));
      Save.write();
      fadeTo(() => { G.state = "end"; G.endT = 0; });
    }
  } else if (p.deadT > 1.1) {
    // возрождение
    fadeTo(() => {
      const keep = G.shardsGot;
      G.player = new Player(G.respawn.x, G.respawn.y, lvl.meta.abilities);
      G.shardsGot = keep;
      // враги возрождаются
      G.enemies = []; G.flyers = [];
      for (const s of lvl.spawns) {
        if (s.char === "E") G.enemies.push(new Walker(s.x + 8, s.y, lvl.meta.enemies.E));
        else if (s.char === "F") G.flyers.push(new Flyer(s.x, s.y, lvl.meta.enemies.F));
      }
    });
    p.deadT = -99; // чтобы fadeTo не вызвался повторно
  }

  G.camera.follow(p.cx, p.y + p.h / 2, dt, lvl.pw, lvl.phh);
}

// ---------- рендер ----------
function drawBackdrop() {
  const bd = Assets.backdrop(G.chapter);
  const cy = G.camera.y;
  // вертикальный параллакс: слои сдвигаются меньше камеры,
  // рисуем с запасом по высоте, чтобы не было пустых полос
  const skyPad = 18;
  ctx.drawImage(bd.sky, 0, -cy * 0.12 - skyPad, VIEW_W, VIEW_H + skyPad * 2);
  for (const [layer, k, kv] of [["far", 0.2, 0.25], ["near", 0.5, 0.45]]) {
    const img = bd[layer];
    const pad = Math.ceil(70 * kv) + 4;
    const y = -cy * kv - pad;
    const h = VIEW_H + pad * 2;
    const off = (-G.camera.x * k) % img.width;
    for (let x = off - img.width; x < VIEW_W; x += img.width)
      ctx.drawImage(img, Math.round(x), y, img.width, h);
  }
}

function drawTiles() {
  const lvl = G.level, ts = Assets.tileset(G.chapter);
  const c0 = Math.max(0, Math.floor(G.camera.ox() / TILE));
  const c1 = Math.min(lvl.cols - 1, Math.ceil((G.camera.ox() + VIEW_W) / TILE));
  for (let r = 0; r < lvl.rows; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = lvl.tile(c, r);
      const x = c * TILE, y = r * TILE;
      if (t === "#") {
        const topOpen = lvl.tile(c, r - 1) !== "#";
        ctx.drawImage(ts, (topOpen ? 0 : 1) * TILE, 0, TILE, TILE, x, y, TILE, TILE);
        // декор поверх земли
        if (topOpen && lvl.tile(c, r - 1) === " ") {
          const h = hash2(c, r * 31 + G.chapter);
          if (h > 0.82) ctx.drawImage(ts, 4 * TILE, 0, TILE, TILE, x, y - TILE, TILE, TILE);
          else if (h < 0.1) ctx.drawImage(ts, 5 * TILE, 0, TILE, TILE, x, y - TILE, TILE, TILE);
        }
      } else if (t === "=") {
        ctx.drawImage(ts, 2 * TILE, 0, TILE, TILE, x, y, TILE, TILE);
      } else if (t === "^") {
        ctx.drawImage(ts, 3 * TILE, 0, TILE, TILE, x, y, TILE, TILE);
      } else if (t === "v") {
        ctx.save();
        ctx.translate(x + TILE / 2, y + TILE / 2);
        ctx.scale(1, -1);
        ctx.drawImage(ts, 3 * TILE, 0, TILE, TILE, -TILE / 2, -TILE / 2, TILE, TILE);
        ctx.restore();
      }
    }
  }
}

function drawHeart(x, y, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = filled ? "#ff6b81" : "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-9, -5, -4, -11, 0, -5);
  ctx.bezierCurveTo(4, -11, 9, -5, 0, 4);
  ctx.fill();
  ctx.restore();
}

function drawHUD() {
  // сердца
  for (let i = 0; i < 3; i++) drawHeart(28 + i * 26, 30, i < G.player.hp);
  // осколки
  const sh = Assets.sheet("shard");
  const fr = Math.floor(performance.now() / 90) % sh.anims.spin.frames;
  ctx.drawImage(sh.img, fr * sh.fw, 0, sh.fw, sh.fh, 16, 44, 26, 26);
  ctx.fillStyle = "#ffe9a3";
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${G.shardsGot} / ${G.shardsTotal}`, 48, 64);
  // время
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "14px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
  ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, VIEW_W - 20, 30);
  ctx.textAlign = "left";

  // титул главы (первые секунды)
  if (G.titleT < 3.2) {
    const a = G.titleT < 0.5 ? G.titleT / 0.5 : G.titleT > 2.5 ? (3.2 - G.titleT) / 0.7 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "18px 'Segoe UI', sans-serif";
    ctx.fillText(G.level.meta.sub, VIEW_W / 2, VIEW_H * 0.3);
    ctx.fillStyle = "#ffe9a3";
    ctx.font = "bold 40px Georgia, serif";
    ctx.fillText(G.level.meta.name, VIEW_W / 2, VIEW_H * 0.3 + 46);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }
}

function drawDialogueBox() {
  const d = G.dialogue;
  if (!d) return;
  const line = d.lines[d.idx];
  const bx = 90, bw = VIEW_W - 180, bh = 110, by = VIEW_H - bh - 26;
  ctx.fillStyle = "rgba(10,12,22,0.88)";
  ctx.strokeStyle = "rgba(255,233,163,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffd76b";
  ctx.font = "bold 16px 'Segoe UI', sans-serif";
  ctx.fillText(line.who, bx + 22, by + 30);
  ctx.fillStyle = "#f0eee6";
  ctx.font = "17px 'Segoe UI', sans-serif";
  // перенос строк
  const words = line.text.slice(0, Math.floor(d.chars)).split(" ");
  let cur = "", yy = by + 58;
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > bw - 44) {
      ctx.fillText(cur, bx + 22, yy);
      yy += 24; cur = w;
    } else cur = test;
  }
  ctx.fillText(cur, bx + 22, yy);
  if (d.chars >= line.text.length) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.fillText("E / Enter ▸", bx + bw - 90, by + bh - 14);
  }
}

function renderPlay() {
  drawBackdrop();
  ctx.save();
  ctx.translate(-Math.round(G.camera.ox()), -Math.round(G.camera.oy()));
  drawTiles();
  for (const c of G.checkpoints) c.draw(ctx);
  if (G.portal) G.portal.draw(ctx);
  for (const mp of G.platforms) mp.draw(ctx, G.chapter);
  for (const s of G.shards) s.draw(ctx);
  for (const e of G.enemies) e.draw(ctx);
  for (const f of G.flyers) f.draw(ctx);
  G.player.draw(ctx);
  G.moth.draw(ctx);
  Particles.draw(ctx);
  ctx.restore();
  drawHUD();
  drawDialogueBox();

  if (G.paused) {
    ctx.fillStyle = "rgba(5,8,15,0.7)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe9a3";
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillText("Пауза", VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText("E / Enter — продолжить    Q — выйти в меню", VIEW_W / 2, VIEW_H / 2 + 24);
    ctx.textAlign = "left";
  }
}

// ---------- меню ----------
function updateMenu(dt) {
  G.titleT += dt;
  if (Input.hit("interact") || Input.hit("jump")) {
    SFX.pickup();
    fadeTo(() => { G.state = "chapters"; G.menuIdx = 0; });
  }
}
function renderMenu() {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#10141f");
  grad.addColorStop(1, "#232c3d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 60; i++) {
    const x = hash2(i, 3) * VIEW_W;
    const y = (hash2(i, 7) * VIEW_H + G.titleT * (4 + hash2(i, 9) * 10)) % VIEW_H;
    ctx.globalAlpha = 0.2 + hash2(i, 5) * 0.5;
    ctx.fillStyle = "#ffe9a3";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  const pulse = 0.85 + Math.sin(G.titleT * 2) * 0.15;
  ctx.save();
  ctx.shadowColor = "#ffe9a3";
  ctx.shadowBlur = 30 * pulse;
  ctx.fillStyle = "#ffeec2";
  ctx.font = "bold 96px Georgia, serif";
  ctx.fillText("ИСКРА", VIEW_W / 2, VIEW_H * 0.42);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "20px 'Segoe UI', sans-serif";
  ctx.fillText("сказка об угасшем свете", VIEW_W / 2, VIEW_H * 0.42 + 40);
  ctx.globalAlpha = 0.5 + Math.sin(G.titleT * 3) * 0.35;
  ctx.fillStyle = "#ffe9a3";
  ctx.font = "18px 'Segoe UI', sans-serif";
  ctx.fillText("нажми Enter", VIEW_W / 2, VIEW_H * 0.72);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "14px 'Segoe UI', sans-serif";
  ctx.fillText("← → / A D — движение   Пробел — прыжок   Shift / X — рывок   E — далее", VIEW_W / 2, VIEW_H * 0.92);
  ctx.textAlign = "left";
}

// ---------- выбор главы ----------
function updateChapters(dt) {
  G.titleT += dt;
  if (Input.hit("left")) { G.menuIdx = (G.menuIdx + 2) % 3; SFX.blip(); }
  if (Input.hit("right")) { G.menuIdx = (G.menuIdx + 1) % 3; SFX.blip(); }
  if (Input.hit("interact") || Input.hit("jump")) {
    const ch = G.menuIdx + 1;
    if (ch <= Save.data.unlocked) {
      SFX.portal();
      fadeTo(() => startChapter(ch));
    } else SFX.hurt();
  }
  if (Input.hit("pause")) fadeTo(() => { G.state = "menu"; });
}
function renderChapters() {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#10141f");
  grad.addColorStop(1, "#1c2433");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffeec2";
  ctx.font = "bold 36px Georgia, serif";
  ctx.fillText("Выбор главы", VIEW_W / 2, 90);
  for (let i = 0; i < 3; i++) {
    const ch = i + 1;
    const meta = CHAPTER_META[ch];
    const locked = ch > Save.data.unlocked;
    const sel = i === G.menuIdx;
    const cw = 240, chh = 260;
    const x = VIEW_W / 2 + (i - 1) * 290 - cw / 2;
    const y = 150 + (sel ? -10 : 0);
    ctx.fillStyle = sel ? "rgba(255,233,163,0.12)" : "rgba(255,255,255,0.05)";
    ctx.strokeStyle = sel ? "#ffe9a3" : "rgba(255,255,255,0.2)";
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, chh, 14);
    ctx.fill(); ctx.stroke();
    // мини-превью: градиент палитры главы
    const pg = ctx.createLinearGradient(0, y + 20, 0, y + 120);
    pg.addColorStop(0, meta.pal.skyTop);
    pg.addColorStop(1, meta.pal.skyBot);
    ctx.fillStyle = pg;
    ctx.fillRect(x + 20, y + 20, cw - 40, 100);
    ctx.fillStyle = meta.pal.groundTop;
    ctx.fillRect(x + 20, y + 100, cw - 40, 20);
    if (locked) {
      ctx.fillStyle = "rgba(10,12,20,0.65)";
      ctx.fillRect(x + 20, y + 20, cw - 40, 100);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "34px 'Segoe UI', sans-serif";
      ctx.fillText("🔒", x + cw / 2, y + 84);
    }
    ctx.fillStyle = locked ? "rgba(255,255,255,0.4)" : "#ffeec2";
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText(meta.sub, x + cw / 2, y + 150);
    ctx.font = "bold 19px Georgia, serif";
    ctx.fillText(meta.name, x + cw / 2, y + 176);
    const best = Save.data.best[ch];
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    if (best) {
      const m = Math.floor(best.time / 60), s = Math.floor(best.time % 60);
      ctx.fillText(`✦ ${best.shards}/${best.total}   ⏱ ${m}:${String(s).padStart(2, "0")}`, x + cw / 2, y + 210);
    } else if (!locked) ctx.fillText("не пройдена", x + cw / 2, y + 210);
  }
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "15px 'Segoe UI', sans-serif";
  ctx.fillText("← → — выбрать    Enter — играть    Esc — назад", VIEW_W / 2, VIEW_H - 40);
  ctx.textAlign = "left";
}

// ---------- экран конца главы ----------
function updateEnd(dt) {
  G.endT += dt;
  if (G.endT > 1 && (Input.hit("interact") || Input.hit("jump"))) {
    if (G.chapter < 3) fadeTo(() => startChapter(G.chapter + 1));
    else fadeTo(() => { G.state = "chapters"; G.menuIdx = 0; });
  }
}
function renderEnd() {
  const meta = CHAPTER_META[G.chapter];
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, meta.pal.skyTop);
  grad.addColorStop(1, meta.pal.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = "#ffe9a3"; ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffeec2";
  ctx.font = "bold 44px Georgia, serif";
  ctx.fillText(G.chapter < 3 ? "Глава пройдена!" : "Свет вернулся…", VIEW_W / 2, VIEW_H * 0.32);
  ctx.restore();
  if (G.chapter === 3) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "18px 'Segoe UI', sans-serif";
    ctx.fillText("Люм вернул осколки Сердцу Небес, и над лесом снова встала заря.", VIEW_W / 2, VIEW_H * 0.42);
    ctx.fillText("Спасибо за игру! (демо трёх глав)", VIEW_W / 2, VIEW_H * 0.42 + 28);
  }
  ctx.fillStyle = "#ffe9a3";
  ctx.font = "20px 'Segoe UI', sans-serif";
  const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
  ctx.fillText(`✦ Осколки: ${G.shardsGot} / ${G.shardsTotal}     ⏱ Время: ${m}:${String(s).padStart(2, "0")}`,
    VIEW_W / 2, VIEW_H * 0.58);
  ctx.globalAlpha = 0.5 + Math.sin(G.endT * 3) * 0.35;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "16px 'Segoe UI', sans-serif";
  ctx.fillText(G.chapter < 3 ? "Enter — следующая глава" : "Enter — в меню", VIEW_W / 2, VIEW_H * 0.75);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

// ---------- главный цикл ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;

  if (G.state === "menu") updateMenu(dt);
  else if (G.state === "chapters") updateChapters(dt);
  else if (G.state === "play") updatePlay(dt);
  else if (G.state === "end") updateEnd(dt);

  // фейд-переходы
  if (G.fadeDir > 0) {
    G.fade = Math.min(1, G.fade + dt * 3);
    if (G.fade >= 1) {
      G.fadeDir = -1;
      if (G.fadeCb) { const cb = G.fadeCb; G.fadeCb = null; cb(); }
    }
  } else if (G.fade > 0) G.fade = Math.max(0, G.fade - dt * 2);

  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (G.state === "loading") {
    ctx.fillStyle = "#0c0f18";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = "#ffe9a3";
    ctx.textAlign = "center";
    ctx.font = "20px Georgia, serif";
    ctx.fillText("загрузка…", VIEW_W / 2, VIEW_H / 2);
    ctx.textAlign = "left";
  }
  else if (G.state === "menu") renderMenu();
  else if (G.state === "chapters") renderChapters();
  else if (G.state === "play") renderPlay();
  else if (G.state === "end") renderEnd();

  if (G.fade > 0) {
    ctx.fillStyle = `rgba(4,6,12,${G.fade})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  Input.endFrame();
  requestAnimationFrame(frame);
}

// ---------- масштабирование канваса ----------
function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.width = Math.max(1, Math.round(VIEW_W * scale * dpr));
  canvas.height = Math.max(1, Math.round(VIEW_H * scale * dpr));
  RENDER_SCALE = canvas.width / VIEW_W;
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// ---------- старт ----------
Assets.loadAll((done, total) => { G.loadProgress = done / total; }).then(() => {
  G.state = "menu";
  G.titleT = 0;
  G.fade = 1;
  G.fadeDir = -1;
});
requestAnimationFrame(frame);
