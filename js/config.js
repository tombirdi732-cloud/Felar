"use strict";
// ============================================================
// ИСКРА — глобальная конфигурация
// ============================================================

const TILE = 32;          // размер тайла в пикселях
const VIEW_W = 960;       // логическое разрешение канваса
const VIEW_H = 540;
const ROWS = 18;          // высота уровня в тайлах
const SCREEN_COLS = 24;   // ширина одного "экрана" карты в тайлах

// Физика игрока
const PHYS = {
  gravity: 2100,
  runSpeed: 260,
  accel: 2800,
  friction: 2400,
  jumpVel: -660,
  jumpCut: 0.45,      // множитель скорости при отпускании прыжка
  coyote: 0.10,       // "время койота", сек
  jumpBuffer: 0.12,   // буфер прыжка, сек
  dashSpeed: 560,
  dashTime: 0.17,
  dashCooldown: 0.45,
  stompBounce: -430,
  maxFall: 900,
};

// ------------------------------------------------------------
// Манифест спрайтов.
// Формат листа: PNG-сетка. Каждая СТРОКА = одна анимация
// (в порядке перечисления ниже), каждый СТОЛБЕЦ = кадр.
// Ширина листа = максимальное число кадров * fw.
// Если файла нет — генерируется анимированный плейсхолдер.
// ------------------------------------------------------------
const SPRITES = {
  lum: {
    file: "assets/sprites/lum.png", fw: 64, fh: 64,
    anims: {
      idle:       { frames: 6, fps: 8,  loop: true  },
      run:        { frames: 8, fps: 14, loop: true  },
      // в листе по 4 кадра, но позы похожи на бег — в воздухе
      // держим один выразительный кадр (start — колонка в листе)
      jump:       { frames: 1, start: 0, fps: 12, loop: false },
      fall:       { frames: 1, start: 2, fps: 12, loop: false },
      doublejump: { frames: 6, fps: 18, loop: false },
      dash:       { frames: 4, fps: 22, loop: false },
      hurt:       { frames: 4, fps: 12, loop: false },
      death:      { frames: 8, fps: 10, loop: false },
    },
  },
  moth: {
    file: "assets/sprites/moth.png", fw: 32, fh: 32,
    anims: {
      fly:  { frames: 6, fps: 16, loop: true },
      talk: { frames: 6, fps: 12, loop: true },
    },
  },
  sprout: { // враг гл.1 — Тенеросток
    file: "assets/sprites/sprout.png", fw: 48, fh: 48,
    anims: {
      walk:   { frames: 6, fps: 10, loop: true  },
      squash: { frames: 4, fps: 14, loop: false },
    },
  },
  crawler: { // враг гл.2 — Гранильщик
    file: "assets/sprites/crawler.png", fw: 48, fh: 48,
    anims: {
      walk:   { frames: 6, fps: 12, loop: true  },
      squash: { frames: 4, fps: 14, loop: false },
    },
  },
  sentry: { // враг гл.3 — Каменный страж
    file: "assets/sprites/sentry.png", fw: 48, fh: 48,
    anims: {
      walk:   { frames: 6, fps: 8,  loop: true  },
      squash: { frames: 4, fps: 14, loop: false },
    },
  },
  bat: { // летун гл.1-2 — Сумрачная мышь
    file: "assets/sprites/bat.png", fw: 32, fh: 32,
    anims: {
      fly:    { frames: 4, fps: 14, loop: true  },
      squash: { frames: 4, fps: 14, loop: false },
    },
  },
  wisp: { // летун гл.3 — Грозовой огонёк
    file: "assets/sprites/wisp.png", fw: 32, fh: 32,
    anims: {
      fly:    { frames: 6, fps: 12, loop: true  },
      squash: { frames: 4, fps: 14, loop: false },
    },
  },
  shard: { // осколок света (коллекционный)
    file: "assets/sprites/shard.png", fw: 32, fh: 32,
    anims: { spin: { frames: 8, fps: 12, loop: true } },
  },
  lantern: { // чекпоинт-фонарь
    file: "assets/sprites/lantern.png", fw: 48, fh: 64,
    anims: {
      off:    { frames: 1, fps: 1,  loop: true  },
      ignite: { frames: 6, fps: 14, loop: false },
      on:     { frames: 6, fps: 8,  loop: true  },
    },
  },
  portal: { // врата в конце главы
    file: "assets/sprites/portal.png", fw: 96, fh: 96,
    anims: { idle: { frames: 8, fps: 10, loop: true } },
  },
};

// Тайлсеты: один PNG на главу, полоса тайлов 32x32.
// Индексы: 0 земля(верх), 1 земля(внутр.), 2 платформа,
// 3 шипы, 4 декор-1, 5 декор-2
const TILESETS = {
  1: "assets/tiles/ch1.png",
  2: "assets/tiles/ch2.png",
  3: "assets/tiles/ch3.png",
};
const TILESET_COUNT = 6;

// Фоны: на главу — sky (960x540, статичный),
// far (1024x540, параллакс 0.2), near (1024x540, параллакс 0.5)
const BACKDROPS = {
  1: { sky: "assets/bg/ch1_sky.webp", far: "assets/bg/ch1_far.webp", near: "assets/bg/ch1_near.webp" },
  2: { sky: "assets/bg/ch2_sky.webp", far: "assets/bg/ch2_far.webp", near: "assets/bg/ch2_near.webp" },
  3: { sky: "assets/bg/ch3_sky.webp", far: "assets/bg/ch3_far.webp", near: "assets/bg/ch3_near.webp" },
};

// Палитры глав (используются плейсхолдерами и UI)
const CHAPTER_META = {
  1: {
    name: "Угасший лес", sub: "Глава I",
    abilities: { doubleJump: false, dash: false },
    enemies: { E: "sprout", F: "bat" },
    pal: { ground: "#2b3f38", groundTop: "#3f5c4e", grass: "#6e9e6a", deep: "#1e2c27",
           skyTop: "#1a2233", skyBot: "#3d4f52", far: "#26333233", accent: "#8fce9a" },
  },
  2: {
    name: "Хрустальные пещеры", sub: "Глава II",
    abilities: { doubleJump: true, dash: false },
    enemies: { E: "crawler", F: "bat" },
    pal: { ground: "#33314f", groundTop: "#4c4a75", grass: "#8b7fd4", deep: "#232138",
           skyTop: "#12101f", skyBot: "#2c2547", far: "#26333233", accent: "#7fd4ff" },
  },
  3: {
    name: "Небесная цитадель", sub: "Глава III",
    abilities: { doubleJump: true, dash: true },
    enemies: { E: "sentry", F: "wisp" },
    pal: { ground: "#5a5f78", groundTop: "#8b91ad", grass: "#d8dcef", deep: "#3c4058",
           skyTop: "#2b3a63", skyBot: "#8fa8d8", far: "#26333233", accent: "#ffd76b" },
  },
};

const SAVE_KEY = "iskra_save_v1";
