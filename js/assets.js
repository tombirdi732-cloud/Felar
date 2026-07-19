"use strict";
// ============================================================
// Загрузка ассетов. Если PNG-файла нет — генерируется
// процедурный анимированный плейсхолдер с той же раскладкой
// спрайт-листа, что ожидается от финального ассета.
// ============================================================

const Assets = (() => {
  const sheets = {};    // name -> {img, fw, fh, anims:{name:{row,frames,fps,loop}}}
  const tilesets = {};  // chapter -> canvas/img
  const backdrops = {}; // chapter -> {sky, far, near}

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // ---------- рисование плейсхолдеров ----------
  function mkCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glowCircle(ctx, x, y, r, color, blur = 10) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Кадр плейсхолдера. name, anim, t∈[0..1) — прогресс анимации.
  // Рисуем в системе координат кадра (0,0 — левый верх), fw x fh.
  function phFrame(ctx, name, anim, t, fw, fh) {
    const cx = fw / 2, ground = fh - 4;
    const S = Math.sin(t * Math.PI * 2);
    const S2 = Math.sin(t * Math.PI * 4);

    if (name === "lum") {
      const bodyC = "#cfeee6", hoodC = "#3f8f7f", scarfC = "#ffb45c", eyeC = "#173b36";
      let bob = 0, tilt = 0, sx = 1, sy = 1, alpha = 1, rot = 0, legSwing = 0, scarfW = 0;
      if (anim === "idle") { bob = S * 1.6; scarfW = S * 2; }
      if (anim === "run") { bob = Math.abs(S2) * 2.5; tilt = 0.12; legSwing = S; scarfW = -5 + S * 2; }
      if (anim === "jump") { sy = 1.12 - t * 0.12; sx = 0.94 + t * 0.06; scarfW = 4; }
      if (anim === "fall") { sy = 0.94; sx = 1.05; scarfW = -3 - t * 3; bob = S * 1.2; }
      if (anim === "doublejump") { rot = t * Math.PI * 2; }
      if (anim === "dash") { sx = 1.4; sy = 0.75; tilt = 0.18; scarfW = -12; }
      if (anim === "hurt") { tilt = -0.25; bob = -2; }
      if (anim === "death") { alpha = 1 - t; sy = 1 - t * 0.4; bob = -t * 10; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, ground - 20 + bob);
      ctx.rotate(rot + tilt);
      ctx.scale(sx, sy);
      // шарф (сзади)
      ctx.strokeStyle = scarfC;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -8);
      ctx.quadraticCurveTo(-10 + scarfW, -4 + S2 * 2, -16 + scarfW * 1.5, 2 + S * 3);
      ctx.stroke();
      // ноги
      if (anim === "run") {
        ctx.fillStyle = hoodC;
        ctx.beginPath(); ctx.ellipse(-4 + legSwing * 6, 18, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(4 - legSwing * 6, 18, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
      } else if (anim !== "death") {
        ctx.fillStyle = hoodC;
        ctx.beginPath(); ctx.ellipse(-4, 19, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(4, 19, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // тело-капюшон
      ctx.fillStyle = hoodC;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(14, -18, 12, 4);
      ctx.quadraticCurveTo(10, 16, 0, 16);
      ctx.quadraticCurveTo(-10, 16, -12, 4);
      ctx.quadraticCurveTo(-14, -18, 0, -22);
      ctx.fill();
      // лицо
      ctx.fillStyle = bodyC;
      ctx.beginPath(); ctx.ellipse(2, -6, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
      // глаза (мигание в idle на последнем кадре)
      const blink = anim === "idle" && t > 0.82;
      ctx.fillStyle = anim === "hurt" ? "#c0392b" : eyeC;
      if (blink) {
        ctx.fillRect(-2, -8, 4, 1.5); ctx.fillRect(5, -8, 4, 1.5);
      } else {
        ctx.beginPath(); ctx.ellipse(0, -7, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(7, -7, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
      // огонёк-светлячок в руке
      if (anim !== "death") glowCircle(ctx, 12, 6 + S * 1.5, 3, "#ffe9a3", 8);
      ctx.restore();
      // линии скорости при рывке
      if (anim === "dash") {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const y = ground - 30 + i * 9;
          ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(4 + 14 + i * 3, y); ctx.stroke();
        }
      }
      // распад на искры при смерти
      if (anim === "death") {
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + t * 3;
          glowCircle(ctx, cx + Math.cos(a) * 14 * t * 2, ground - 24 - t * 22 + Math.sin(a) * 8,
            2.5 * (1 - t), "#ffe9a3", 6);
        }
      }
      return;
    }

    if (name === "moth") {
      const flap = Math.sin(t * Math.PI * 2 * 2);
      ctx.save();
      ctx.translate(cx, fh / 2 + 2 + S * 1.5);
      // крылья
      ctx.fillStyle = anim === "talk" ? "#ffe9b8" : "#f2f0ff";
      ctx.save(); ctx.scale(1, 0.5 + Math.abs(flap) * 0.5);
      ctx.beginPath(); ctx.ellipse(-7, -3, 7, 9, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(7, -3, 7, 9, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // тельце
      ctx.fillStyle = "#8a86b8";
      ctx.beginPath(); ctx.ellipse(0, 1, 3.4, 6, 0, 0, Math.PI * 2); ctx.fill();
      glowCircle(ctx, 0, -4, 2, "#ffe9a3", 6);
      if (anim === "talk" && (t * 6 | 0) % 2 === 0)
        glowCircle(ctx, 9, -8, 1.6, "#ffffff", 5);
      ctx.restore();
      return;
    }

    if (name === "sprout" || name === "crawler" || name === "sentry") {
      const cols = {
        sprout:  { body: "#4a5d3a", top: "#7ba24f", eye: "#e8f6d8" },
        crawler: { body: "#4a3f6b", top: "#8b7fd4", eye: "#e0d8ff" },
        sentry:  { body: "#5a5f78", top: "#9aa0bd", eye: "#ffd76b" },
      }[name];
      ctx.save();
      if (anim === "squash") {
        const k = 1 - t;
        ctx.translate(cx, ground);
        ctx.scale(1 + t * 0.5, Math.max(0.15, k * 0.6));
        ctx.globalAlpha = k;
        ctx.fillStyle = cols.body;
        rr(ctx, -16, -22, 32, 22, 8); ctx.fill();
        ctx.fillStyle = cols.eye;
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("x", -9, -10); ctx.fillText("x", 4, -10);
        ctx.restore();
        return;
      }
      const hop = name === "sprout" ? Math.abs(S) * 5 : 0;
      const rock = name === "sentry" ? S * 0.12 : 0;
      const wig = name === "crawler" ? S2 * 1.5 : 0;
      ctx.translate(cx, ground - hop);
      ctx.rotate(rock);
      const squish = name === "sprout" ? 1 - Math.abs(S) * 0.15 : 1;
      ctx.scale(2 - squish, squish);
      ctx.fillStyle = cols.body;
      if (name === "crawler") {
        // сегментированный жук
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(i * 10, -8 + (i === 0 ? -2 : 0) + wig * i, 9, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // ножки
        ctx.strokeStyle = cols.body; ctx.lineWidth = 2.5;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 6, -3);
          ctx.lineTo(i * 6 + S2 * 3 * (i % 2 ? 1 : -1), 0);
          ctx.stroke();
        }
      } else if (name === "sentry") {
        rr(ctx, -15, -30, 30, 30, 5); ctx.fill();
        // руна
        ctx.strokeStyle = cols.eye; ctx.lineWidth = 2;
        ctx.save();
        ctx.shadowColor = cols.eye; ctx.shadowBlur = 6 + Math.abs(S) * 5;
        ctx.strokeRect(-6, -22, 12, 12);
        ctx.beginPath(); ctx.moveTo(-6, -16); ctx.lineTo(6, -16); ctx.stroke();
        ctx.restore();
      } else {
        // луковица-росток
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.quadraticCurveTo(15, -22, 13, -6);
        ctx.quadraticCurveTo(11, 0, 0, 0);
        ctx.quadraticCurveTo(-11, 0, -13, -6);
        ctx.quadraticCurveTo(-15, -22, 0, -26);
        ctx.fill();
        // листик
        ctx.fillStyle = cols.top;
        ctx.beginPath();
        ctx.ellipse(3 + S * 2, -30, 6, 3.4, -0.5 + S * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // глаза
      if (name !== "sentry") {
        ctx.fillStyle = cols.eye;
        ctx.beginPath(); ctx.arc(-5, name === "crawler" ? -10 : -13, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, name === "crawler" ? -10 : -13, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (name === "bat" || name === "wisp") {
      ctx.save();
      ctx.translate(cx, fh / 2 + S * 2);
      if (anim === "squash") {
        ctx.globalAlpha = 1 - t;
        ctx.scale(1 + t, 1 - t * 0.7);
      }
      if (name === "bat") {
        const flap = Math.sin(t * Math.PI * 2 * (anim === "squash" ? 1 : 2));
        ctx.fillStyle = "#3d3550";
        // крылья
        ctx.save(); ctx.rotate(-0.3 - flap * 0.5);
        ctx.beginPath(); ctx.ellipse(-9, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save(); ctx.rotate(0.3 + flap * 0.5);
        ctx.beginPath(); ctx.ellipse(9, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // тело
        ctx.fillStyle = "#554a70";
        ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffb45c";
        ctx.beginPath(); ctx.arc(-2, -1, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2, -1, 1.4, 0, Math.PI * 2); ctx.fill();
      } else {
        // грозовой огонёк — пламя-капля
        const flick = 1 + Math.sin(t * Math.PI * 6) * 0.12;
        ctx.save();
        ctx.shadowColor = "#9fd8ff"; ctx.shadowBlur = 10;
        ctx.fillStyle = "#7fd4ff";
        ctx.beginPath();
        ctx.moveTo(0, -9 * flick);
        ctx.quadraticCurveTo(8, -2, 0, 8);
        ctx.quadraticCurveTo(-8, -2, 0, -9 * flick);
        ctx.fill();
        ctx.fillStyle = "#eaf8ff";
        ctx.beginPath(); ctx.ellipse(0, 1, 3, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#1c3a55";
        ctx.beginPath(); ctx.arc(-1.6, 0, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(1.6, 0, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (name === "shard") {
      const k = Math.cos(t * Math.PI * 2); // "вращение" вокруг вертикали
      ctx.save();
      ctx.translate(cx, fh / 2 + S * 1.5);
      ctx.scale(Math.max(0.12, Math.abs(k)), 1);
      ctx.shadowColor = "#ffe9a3"; ctx.shadowBlur = 12;
      ctx.fillStyle = k > 0 ? "#ffe9a3" : "#ffd76b";
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(7, 0); ctx.lineTo(0, 11); ctx.lineTo(-7, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(3.4, 0); ctx.lineTo(0, 6); ctx.lineTo(-3.4, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }

    if (name === "lantern") {
      const lit = anim === "on" || anim === "ignite";
      const k = anim === "ignite" ? t : anim === "on" ? 0.7 + Math.abs(S) * 0.3 : 0;
      // столб
      ctx.fillStyle = "#3a3348";
      ctx.fillRect(cx - 3, 18, 6, fh - 22);
      ctx.fillRect(cx - 10, fh - 6, 20, 4);
      // корпус фонаря
      ctx.fillStyle = "#4c4460";
      rr(ctx, cx - 9, 4, 18, 20, 4); ctx.fill();
      ctx.fillStyle = "#2c2638";
      ctx.fillRect(cx - 6, 8, 12, 12);
      if (lit && k > 0.05) {
        glowCircle(ctx, cx, 14, 4 + k * 2, "#ffe9a3", 14 * k);
      }
      return;
    }

    if (name === "portal") {
      const R = 34;
      ctx.save();
      ctx.translate(cx, fh / 2 + 4);
      // внутреннее свечение
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
      g.addColorStop(0, "rgba(255,233,163,0.9)");
      g.addColorStop(1, "rgba(120,90,200,0.15)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R - 4, 0, Math.PI * 2); ctx.fill();
      // кольцо
      ctx.strokeStyle = "#8a7fd4";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      // вращающиеся руны
      for (let i = 0; i < 6; i++) {
        const a = t * Math.PI * 2 + (i * Math.PI) / 3;
        glowCircle(ctx, Math.cos(a) * R, Math.sin(a) * R, 3.4, "#ffe9a3", 8);
      }
      ctx.restore();
      return;
    }
  }

  function buildPlaceholderSheet(name, spec) {
    const animNames = Object.keys(spec.anims);
    const maxFrames = Math.max(...animNames.map((a) => spec.anims[a].frames));
    const c = mkCanvas(maxFrames * spec.fw, animNames.length * spec.fh);
    const ctx = c.getContext("2d");
    animNames.forEach((an, row) => {
      const a = spec.anims[an];
      for (let f = 0; f < a.frames; f++) {
        ctx.save();
        ctx.translate(f * spec.fw, row * spec.fh);
        ctx.beginPath();
        ctx.rect(0, 0, spec.fw, spec.fh);
        ctx.clip();
        phFrame(ctx, name, an, f / a.frames, spec.fw, spec.fh);
        ctx.restore();
      }
    });
    return c;
  }

  // ---------- тайлсеты ----------
  function buildPlaceholderTileset(ch) {
    const pal = CHAPTER_META[ch].pal;
    const c = mkCanvas(TILESET_COUNT * TILE, TILE);
    const ctx = c.getContext("2d");
    const T = TILE;
    // 0: земля (верх)
    ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = pal.groundTop; ctx.fillRect(0, 0, T, 8);
    ctx.fillStyle = pal.grass;
    for (let i = 0; i < 6; i++) {
      const x = 2 + i * 5 + hash2(i, ch) * 3;
      ctx.fillRect(x, 0, 2.5, 4 + hash2(i, ch * 7) * 3);
    }
    // 1: земля (внутренняя)
    ctx.fillStyle = pal.deep; ctx.fillRect(T, 0, T, T);
    ctx.fillStyle = pal.ground;
    for (let i = 0; i < 5; i++)
      ctx.fillRect(T + 3 + hash2(i, ch * 3) * 24, 4 + hash2(i, ch * 5) * 24, 4, 3);
    // 2: платформа (one-way)
    ctx.fillStyle = pal.groundTop; ctx.fillRect(2 * T, 2, T, 10);
    ctx.fillStyle = pal.ground; ctx.fillRect(2 * T, 9, T, 3);
    ctx.fillStyle = pal.grass; ctx.fillRect(2 * T, 2, T, 3);
    // 3: шипы
    ctx.fillStyle = "#c9c4d4";
    for (let i = 0; i < 4; i++) {
      const x = 3 * T + i * 8;
      ctx.beginPath();
      ctx.moveTo(x, T); ctx.lineTo(x + 4, T - 20); ctx.lineTo(x + 8, T);
      ctx.closePath(); ctx.fill();
    }
    // 4: декор-1 (гриб / кристалл / обломок колонны)
    ctx.save();
    ctx.translate(4 * T + T / 2, T);
    if (ch === 1) {
      ctx.fillStyle = "#b06a8f";
      ctx.beginPath(); ctx.ellipse(0, -12, 9, 6, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#e8dcc8"; ctx.fillRect(-2.5, -12, 5, 12);
    } else if (ch === 2) {
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(7, 0); ctx.lineTo(-7, 0);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = "#8b91ad";
      ctx.fillRect(-6, -18, 12, 18);
      ctx.fillRect(-9, -22, 18, 5);
    }
    ctx.restore();
    // 5: декор-2 (папоротник / жеода / руна)
    ctx.save();
    ctx.translate(5 * T + T / 2, T);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    if (ch === 1) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(i * 8, -10, i * 10, -16);
        ctx.stroke();
      }
    } else if (ch === 2) {
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(3, 0); ctx.lineTo(-3, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(9, 0); ctx.lineTo(2, 0); ctx.closePath(); ctx.stroke();
    } else {
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 6;
      ctx.strokeRect(-6, -14, 12, 12);
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.stroke();
    }
    ctx.restore();
    return c;
  }

  // ---------- фоны ----------
  function buildPlaceholderBackdrop(ch, layer) {
    const pal = CHAPTER_META[ch].pal;
    const w = layer === "sky" ? VIEW_W : 1024;
    const c = mkCanvas(w, VIEW_H);
    const ctx = c.getContext("2d");
    if (layer === "sky") {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, pal.skyTop);
      g.addColorStop(1, pal.skyBot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, VIEW_H);
      // звёзды / светлячки / блики
      for (let i = 0; i < 40; i++) {
        const x = hash2(i, ch) * w, y = hash2(i, ch * 13) * VIEW_H * 0.7;
        ctx.globalAlpha = 0.25 + hash2(i, 5) * 0.5;
        ctx.fillStyle = ch === 3 ? "#fff6d8" : "#cfe8ff";
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
      // луна/сияние
      glowCircle(ctx, w * 0.78, VIEW_H * 0.2, 26, ch === 3 ? "#ffe9a3" : "#dfeaff", 40);
      return c;
    }
    // силуэты: far — светлее и ниже контраст, near — темнее и крупнее
    const isFar = layer === "far";
    ctx.clearRect(0, 0, w, VIEW_H);
    const col = isFar ? "rgba(30,40,50,0.45)" : "rgba(12,18,24,0.7)";
    ctx.fillStyle = col;
    const n = isFar ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w + hash2(i, ch * 3) * 60;
      const hgt = (isFar ? 150 : 260) + hash2(i, ch * 7) * 120;
      if (ch === 1) {
        // силуэты деревьев
        ctx.fillRect(x, VIEW_H - hgt, isFar ? 10 : 18, hgt);
        ctx.beginPath();
        ctx.ellipse(x + (isFar ? 5 : 9), VIEW_H - hgt, isFar ? 34 : 60, isFar ? 50 : 90, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ch === 2) {
        // сталагмиты и сталактиты
        ctx.beginPath();
        ctx.moveTo(x - 40, VIEW_H); ctx.lineTo(x, VIEW_H - hgt); ctx.lineTo(x + 40, VIEW_H);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 60, 0); ctx.lineTo(x + 90, hgt * 0.5); ctx.lineTo(x + 120, 0);
        ctx.closePath(); ctx.fill();
      } else {
        // облака и башни
        ctx.beginPath();
        ctx.ellipse(x, VIEW_H - 60 - hash2(i, 11) * 200, isFar ? 60 : 100, isFar ? 16 : 26, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!isFar && i % 2 === 0) {
          ctx.fillRect(x - 14, VIEW_H - hgt, 28, hgt);
          ctx.fillRect(x - 20, VIEW_H - hgt - 8, 40, 10);
        }
      }
    }
    return c;
  }

  // ---------- публичное API ----------
  async function loadAll(onProgress) {
    const jobs = [];
    for (const [name, spec] of Object.entries(SPRITES)) {
      jobs.push(loadImage(spec.file).then((img) => {
        const animNames = Object.keys(spec.anims);
        const anims = {};
        animNames.forEach((an, row) => {
          anims[an] = Object.assign({ row }, spec.anims[an]);
        });
        sheets[name] = {
          img: img || buildPlaceholderSheet(name, spec),
          fw: spec.fw, fh: spec.fh, anims,
          placeholder: !img,
        };
      }));
    }
    for (const [ch, file] of Object.entries(TILESETS)) {
      jobs.push(loadImage(file).then((img) => {
        tilesets[ch] = img || buildPlaceholderTileset(+ch);
      }));
    }
    for (const [ch, layers] of Object.entries(BACKDROPS)) {
      backdrops[ch] = {};
      for (const [layer, file] of Object.entries(layers)) {
        jobs.push(loadImage(file).then((img) => {
          backdrops[ch][layer] = img || buildPlaceholderBackdrop(+ch, layer);
        }));
      }
    }
    let done = 0;
    await Promise.all(jobs.map((j) => j.then(() => onProgress && onProgress(++done, jobs.length))));
  }

  return {
    loadAll,
    sheet: (name) => sheets[name],
    tileset: (ch) => tilesets[ch],
    backdrop: (ch) => backdrops[ch],
  };
})();
