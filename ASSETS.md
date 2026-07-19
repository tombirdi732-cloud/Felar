# ИСКРА — спецификация и промты ассетов

Игра уже играбельна на процедурных плейсхолдерах. Чтобы подключить настоящую
графику, просто положи PNG-файл по указанному пути — код сам подхватит его
вместо плейсхолдера (ничего перекомпилировать не нужно, просто обнови страницу).

---

## 0. Общий стиль (добавляй к каждому промту)

**Базовый стиль-промт (EN):**
> hand-painted 2D game art, dark fairy-tale atmosphere, soft rim lighting,
> glowing warm accents on cool desaturated background, style of Hollow Knight
> and Ori and the Blind Forest, clean silhouette, transparent background, PNG

**По-русски:** рисованная 2D-графика, тёмная сказка, мягкий контурный свет,
тёплые светящиеся акценты на холодном приглушённом фоне, чистый читаемый
силуэт, прозрачный фон.

**Технические требования ко всем спрайтам:**
- PNG с прозрачностью (RGBA).
- Спрайт-лист — сетка: **каждая строка = одна анимация** (в порядке из таблицы),
  **каждый столбец = кадр**. Размер кадра фиксированный для файла.
- Ширина файла = (макс. число кадров) × (ширина кадра); высота = (число анимаций) × (высота кадра).
- Персонаж смотрит **вправо** (отзеркаливание влево делает движок).
- Точка опоры — низ кадра по центру (персонаж «стоит» на нижней границе кадра).
- Если генератор не умеет спрайт-листы: генерируй кадры по одному
  (промт + «frame N of M, animation: run cycle»), потом склей в сетку
  (например, в Aseprite / Photoshop / любым скриптом).

---

## 1. Персонажи

### 1.1 Люм — герой (`assets/sprites/lum.png`)
Кадр **64×64**, максимум 8 кадров → файл **512×512** (8 строк).

| Ряд | Анимация | Кадров | FPS | Что происходит |
|----|-----------|--------|-----|----------------|
| 0 | idle | 6 | 8 | дыхание, покачивание, моргание на последнем кадре |
| 1 | run | 8 | 14 | цикл бега, шарф развевается |
| 2 | jump | 4 | 12 | толчок вверх, вытягивание тела |
| 3 | fall | 4 | 12 | падение, шарф вверх |
| 4 | doublejump | 6 | 18 | сальто/оборот на 360° |
| 5 | dash | 5 | 22 | рывок: тело вытянуто, линии скорости |
| 6 | hurt | 4 | 12 | отшатывание, вспышка |
| 7 | death | 8 | 10 | распадается на светящиеся искры |

**Промт (EN):**
> small forest spirit lantern-keeper character, tiny hooded figure in deep
> teal cloak, pale glowing face with large dark eyes, orange scarf, holding a
> tiny glowing ember light, cute but melancholic, 64x64 sprite, side view
> facing right + базовый стиль

### 1.2 Мотылёк — спутник (`assets/sprites/moth.png`)
Кадр **32×32**, файл **192×64** (2 строки × 6 кадров).

| Ряд | Анимация | Кадров | FPS |
|----|-----------|--------|-----|
| 0 | fly | 6 | 16 |
| 1 | talk | 6 | 12 (крылья + искорки, «говорит») |

**Промт (EN):**
> tiny glowing moth companion spirit, soft cream-white wings with faint
> golden dust, small lavender body, gentle warm glow, fairy-like, 32x32
> sprite, side view + базовый стиль

---

## 2. Враги

Все враги смотрят **вправо**, ряд 1 — всегда «squash» (раздавлен прыжком
сверху: сплющивание + исчезновение).

### 2.1 Тенеросток — гл. 1 (`assets/sprites/sprout.png`)
Кадр **48×48**, файл **288×96**. Ряд 0: walk (6 кадров, 10 fps, прыгучая
походка с приседанием), ряд 1: squash (4 кадра, 14 fps).

**Промт (EN):**
> corrupted plant bulb monster, small onion-shaped dark green creature with
> a single wilted leaf on top, glowing pale eyes, hopping walk, forest
> shadow creature, 48x48 sprite + базовый стиль

### 2.2 Гранильщик — гл. 2 (`assets/sprites/crawler.png`)
Кадр **48×48**, файл **288×96**. Ряд 0: walk (6, 12 fps, семенит ножками),
ряд 1: squash (4, 14 fps).

**Промт (EN):**
> segmented cave beetle monster, three-part rounded violet carapace with
> faint crystal shards growing on its back, many small legs, glowing pale
> lavender eyes, 48x48 sprite + базовый стиль

### 2.3 Каменный страж — гл. 3 (`assets/sprites/sentry.png`)
Кадр **48×48**, файл **288×96**. Ряд 0: walk (6, 8 fps, тяжёлое
покачивание), ряд 1: squash (4, 14 fps, трескается).

**Промт (EN):**
> small ancient stone golem sentinel, weathered grey-blue rock cube body
> with glowing golden rune on its chest, slow heavy rocking walk, sky
> citadel guardian, 48x48 sprite + базовый стиль

### 2.4 Сумрачная мышь — гл. 1–2 (`assets/sprites/bat.png`)
Кадр **32×32**, файл **128×64**. Ряд 0: fly (4, 14 fps, взмахи), ряд 1:
squash (4, 14 fps).

**Промт (EN):**
> small shadow bat creature, dark purple round fluffy body, wide dusk-grey
> wings, tiny amber glowing eyes, 32x32 sprite, flying + базовый стиль

### 2.5 Грозовой огонёк — гл. 3 (`assets/sprites/wisp.png`)
Кадр **32×32**, файл **192×64**. Ряд 0: fly (6, 12 fps, мерцание пламени),
ряд 1: squash (4, 14 fps, гаснет).

**Промт (EN):**
> hostile storm wisp spirit, teardrop-shaped pale blue flame with white hot
> core and small dark eyes, electric flicker, floating, 32x32 sprite + базовый стиль

---

## 3. Объекты

### 3.1 Осколок света (`assets/sprites/shard.png`)
Кадр **32×32**, файл **256×32**. Ряд 0: spin (8, 12 fps) — вращение
вокруг вертикальной оси (сужается и расширяется) + пульс свечения.

**Промт (EN):**
> glowing golden light shard crystal, small floating diamond-shaped star
> fragment, warm amber glow with white core, collectible item, 32x32 sprite + базовый стиль

### 3.2 Чекпоинт-фонарь (`assets/sprites/lantern.png`)
Кадр **48×64**, файл **288×192** (3 строки × макс 6 кадров).

| Ряд | Анимация | Кадров | FPS |
|----|-----------|--------|-----|
| 0 | off | 1 | — (потухший) |
| 1 | ignite | 6 | 14 (разгорается) |
| 2 | on | 6 | 8 (горит, пламя колышется) |

**Промт (EN):**
> old iron lantern post, dark forged metal street lamp with glass cage,
> warm candle flame inside, fairy-tale checkpoint marker, 48x64 sprite + базовый стиль

### 3.3 Врата главы (`assets/sprites/portal.png`)
Кадр **96×96**, файл **768×96**. Ряд 0: idle (8, 10 fps) — вращающиеся
руны по кольцу, пульсирующее сияние внутри.

**Промт (EN):**
> ancient magical portal gate, ring of violet stone with six rotating glowing
> golden runes, soft radiant light inside the ring, 96x96 sprite + базовый стиль

---

## 4. Тайлсеты (блоки)

Один файл на главу: полоса **192×32** — шесть тайлов 32×32 слева направо:

| № | Тайл | Описание |
|---|------|----------|
| 0 | земля (верх) | поверхность с травой/кристаллами/кладкой |
| 1 | земля (внутри) | тёмное заполнение под поверхностью |
| 2 | платформа | тонкая one-way платформа (верхние 12px тайла) |
| 3 | шипы | 4 треугольных шипа снизу вверх (движок сам переворачивает для потолка) |
| 4 | декор-1 | гриб / кристалл / обломок колонны |
| 5 | декор-2 | папоротник / друза мелких кристаллов / светящаяся руна |

Тайлы 0–2 должны **бесшовно стыковаться** по горизонтали.

### 4.1 `assets/tiles/ch1.png` — Угасший лес
> seamless 2D platformer tileset, mossy dark forest ground with muted green
> grass top edge, rich dark soil, wooden one-way platform, pale bone-like
> spikes, glowing mushroom decor, fern decor, 32x32 tiles + базовый стиль

### 4.2 `assets/tiles/ch2.png` — Хрустальные пещеры
> seamless 2D platformer tileset, dark violet cave stone with faint crystal
> veins, amethyst top edge glow, crystal platform ledge, sharp crystal
> spikes, big glowing cyan crystal decor, small geode cluster decor, 32x32 tiles + базовый стиль

### 4.3 `assets/tiles/ch3.png` — Небесная цитадель
> seamless 2D platformer tileset, ancient sky-castle masonry, pale blue-grey
> stone blocks with cloud-worn edges, marble platform ledge, golden spear
> spikes, broken column decor, glowing rune tablet decor, 32x32 tiles + базовый стиль

---

## 5. Фоны (по 3 слоя на главу)

| Файл | Размер | Параллакс | Что на нём |
|------|--------|-----------|------------|
| `chN_sky.png` | 960×540 | статичен | небо/градиент, луна, звёзды |
| `chN_far.png` | 1024×540 | 0.2 | дальние силуэты, **прозрачный фон**, бесшовный по X |
| `chN_near.png` | 1024×540 | 0.5 | ближние силуэты, **прозрачный фон**, бесшовный по X |

### 5.1 Глава 1 — Угасший лес (`assets/bg/ch1_*.png`)
- sky: > twilight forest sky, deep blue-teal gradient, pale moon, faint fireflies
- far: > distant dark tree silhouettes layer, seamless horizontal tile, transparent background
- near: > large gnarled tree trunks and branches silhouettes, hanging moss, seamless, transparent background

### 5.2 Глава 2 — Хрустальные пещеры (`assets/bg/ch2_*.png`)
- sky: > dark violet cave depth gradient, faint glowing crystal dust particles
- far: > distant stalagmite and stalactite silhouettes with faint crystal glow, seamless, transparent
- near: > large cave rock formations and glowing crystal clusters silhouettes, seamless, transparent

### 5.3 Глава 3 — Небесная цитадель (`assets/bg/ch3_*.png`)
- sky: > dawn sky above the clouds, soft blue to warm gold gradient, glowing sun
- far: > distant floating islands and cloud banks silhouettes, seamless, transparent
- near: > ruined sky citadel towers and large clouds silhouettes, seamless, transparent

(к каждому добавляй базовый стиль-промт)

---

## 6. Звук и музыка (на будущее, в коде пока процедурные SFX)

Музыка (например, Suno / Udio), лупы 60–90 сек, формат ogg/mp3:
- **Гл. 1:** > melancholic fairy-tale forest ambient, music box and soft strings, mysterious, calm loop, game background music
- **Гл. 2:** > crystal cave ambient, glass-like bells, deep reverb drones, wonder and echo, loop
- **Гл. 3:** > airy heroic finale, soft choir and harp above the clouds, hopeful, loop
- **Меню:** > quiet lullaby theme, single music box melody, warm and sad

SFX (прыжок, подбор осколка, урон, чекпоинт, портал) сейчас синтезируются
кодом — можно заменить позже, скажешь, и я добавлю загрузку файлов.

---

## 7. Как подключать

1. Сгенерируй PNG по промту.
2. Приведи к точному размеру и раскладке из таблицы (кадры слева направо, анимации сверху вниз).
3. Положи файл по указанному пути в репозитории.
4. Обнови страницу — движок сам заменит плейсхолдер этим файлом.

Если ассет выглядит криво (не тот масштаб, смещён центр) — покажи мне файл,
я подгоню параметры кадра в `js/config.js` под него.
