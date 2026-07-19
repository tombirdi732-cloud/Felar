# ИСКРА — спецификация и промты ассетов

Игра уже играбельна на процедурных плейсхолдерах. Чтобы подключить настоящую
графику, положи PNG по указанному пути — код сам подхватит его вместо
плейсхолдера (просто обнови страницу).

**Рабочий процесс:** генераторы плохо делают целый спрайт-лист сразу,
поэтому генерируем **одну анимацию = одна картинка** (ряд кадров), а сборкой
листов занимается Клод: присылай ему результаты в любом виде (полоса, сетка,
отдельные кадры, неровные кадры) — он нарежет, выровняет и соберёт.

---

## 0. Формула промта

Каждый промт = **ОПИСАНИЕ + ФРАЗА АНИМАЦИИ + СТИЛЬ** (склеить через запятую).

**СТИЛЬ — общий хвост для всех спрайтов:**

```
hand-painted 2D game art, dark fairy-tale atmosphere, soft rim lighting, style of Hollow Knight and Ori and the Blind Forest, clean silhouette, all frames identical in size and evenly spaced in one horizontal row, transparent background
```

Ключевые слова, которые заставляют генератор делать НЕСКОЛЬКО кадров:
`sprite sheet`, `N frames ... in a single horizontal row`,
`the exact same character in every frame`,
`identical size and position in each frame`, `frame-by-frame animation`.

**Требования к результату:**
- PNG с прозрачностью, персонаж смотрит **вправо**.
- Одна картинка = один ряд кадров одной анимации.
- Финальная раскладка листа (собирает Клод): строка = анимация в порядке из
  таблиц ниже, столбец = кадр, точка опоры — низ кадра.

---

## 1. Люм — герой (`assets/sprites/lum.png`)
Кадр **64×64**, итоговый файл **512×512** (8 строк). Нужно **8 генераций**.

**ОПИСАНИЕ (одинаковое для всех 8):**

```
small forest spirit lantern-keeper game character, tiny hooded figure in deep teal cloak, pale glowing face with large dark eyes, orange scarf, holding a tiny glowing golden ember, cute but melancholic, side view facing right
```

**ФРАЗЫ АНИМАЦИЙ:**

| Ряд | Анимация | FPS | Фраза |
|---|---|---|---|
| 0 | idle | 8 | `sprite sheet, 6 frames of idle animation in a single horizontal row, the exact same character in every frame, subtle breathing and swaying, blinking on the last frame` |
| 1 | run | 14 | `sprite sheet, 8 frames of a full run cycle in a single horizontal row, the exact same character in every frame, legs mid-stride, scarf flowing behind` |
| 2 | jump | 12 | `sprite sheet, 4 frames of a jump take-off in a single horizontal row, the exact same character, body stretching upward` |
| 3 | fall | 12 | `sprite sheet, 4 frames of a falling pose in a single horizontal row, the exact same character, scarf flying upward` |
| 4 | doublejump | 18 | `sprite sheet, 6 frames of a 360 degree mid-air somersault in a single horizontal row, the exact same character rotating step by step` |
| 5 | dash | 22 | `sprite sheet, 5 frames of a fast horizontal dash in a single horizontal row, the exact same character, body stretched forward, speed lines` |
| 6 | hurt | 12 | `sprite sheet, 4 frames of getting hit in a single horizontal row, the exact same character recoiling with eyes shut, brief white flash` |
| 7 | death | 10 | `sprite sheet, 8 frames of dissolving into golden sparks in a single horizontal row, the exact same character gradually fading away` |

---

## 2. Мотылёк — спутник (`assets/sprites/moth.png`)
Кадр **32×32**, файл **192×64** (2 строки × 6). **2 генерации.**

**ОПИСАНИЕ:**

```
tiny glowing moth companion spirit, soft cream-white wings with golden dust, small lavender fuzzy body, gentle warm glow, fairy-like, flying, side view
```

| Ряд | Анимация | FPS | Фраза |
|---|---|---|---|
| 0 | fly | 16 | `sprite sheet, 6 frames of a wing flap flying cycle in a single horizontal row, the exact same moth in every frame` |
| 1 | talk | 12 | `sprite sheet, 6 frames of fluttering and emitting tiny golden sparkles in a single horizontal row, the exact same moth in every frame` |

---

## 3. Враги

У всех: ряд 0 — движение, ряд 1 — squash. **По 2 генерации на врага.**

**Общая фраза squash (подставляется к описанию существа):**

```
sprite sheet, 4 frames of being squashed flat and vanishing in a single horizontal row, the exact same creature getting flatter and fading in each frame
```

### 3.1 Тенеросток — гл. 1 (`assets/sprites/sprout.png`), кадр 48×48, файл 288×96
ОПИСАНИЕ: `corrupted plant bulb monster, small onion-shaped dark green creature with a single wilted leaf on top, glowing pale green eyes, forest shadow creature, side view facing right`
- walk (6 кадров, 10 fps): `sprite sheet, 6 frames of a hopping squishy walk cycle in a single horizontal row, the exact same creature in every frame, squashing and stretching as it hops`

### 3.2 Гранильщик — гл. 2 (`assets/sprites/crawler.png`), кадр 48×48, файл 288×96
ОПИСАНИЕ: `segmented cave beetle monster, three rounded violet carapace segments with small glowing crystal shards on its back, many tiny legs, pale lavender glowing eyes, side view facing right`
- walk (6, 12 fps): `sprite sheet, 6 frames of a crawling walk cycle in a single horizontal row, the exact same creature in every frame, legs skittering`

### 3.3 Каменный страж — гл. 3 (`assets/sprites/sentry.png`), кадр 48×48, файл 288×96
ОПИСАНИЕ: `small ancient stone golem sentinel, weathered grey-blue rock cube body with a glowing golden rune on its chest, mossy cracks, sky citadel guardian, side view facing right`
- walk (6, 8 fps): `sprite sheet, 6 frames of a slow heavy rocking walk in a single horizontal row, the exact same golem in every frame, tilting side to side`
- squash: общая фраза + `cracking apart` вместо `getting flatter`

### 3.4 Сумрачная мышь — гл. 1–2 (`assets/sprites/bat.png`), кадр 32×32, файл 128×64
ОПИСАНИЕ: `small shadow bat creature, dark purple round fluffy body, wide dusk-grey webbed wings, tiny amber glowing eyes, flying, side view`
- fly (4, 14 fps): `sprite sheet, 4 frames of a full wing flap cycle in a single horizontal row, the exact same bat in every frame`

### 3.5 Грозовой огонёк — гл. 3 (`assets/sprites/wisp.png`), кадр 32×32, файл 192×64
ОПИСАНИЕ: `hostile storm wisp spirit, teardrop-shaped pale blue flame with white-hot core and small dark angry eyes, floating`
- fly (6, 12 fps): `sprite sheet, 6 frames of a flame flicker cycle in a single horizontal row, the exact same wisp in every frame, flame tip waving`
- squash: `sprite sheet, 4 frames of the flame shrinking and going out in a single horizontal row, the exact same wisp fading in each frame`

---

## 4. Объекты

### 4.1 Осколок света (`assets/sprites/shard.png`), кадр 32×32, файл 256×32
ОПИСАНИЕ: `glowing golden light shard, small floating diamond-shaped star fragment, warm amber glow with bright white core, magical collectible item`
- spin (8, 12 fps): `sprite sheet, 8 frames of a spin animation in a single horizontal row, the same diamond rotating around its vertical axis, narrowing to a sliver in the middle frames and opening again, glow pulsing`

### 4.2 Чекпоинт-фонарь (`assets/sprites/lantern.png`), кадр 48×64, файл 288×192
ОПИСАНИЕ: `old iron lantern post, dark forged metal street lamp with glass cage on a slim pole, fairy-tale checkpoint marker`. **3 генерации:**

| Ряд | Анимация | Кадров | FPS | Фраза |
|---|---|---|---|---|
| 0 | off | 1 | — | `single frame, the lantern unlit and dark` |
| 1 | ignite | 6 | 14 | `sprite sheet, 6 frames of the candle flame igniting and growing in a single horizontal row, the exact same lantern in every frame` |
| 2 | on | 6 | 8 | `sprite sheet, 6 frames of a warm flame gently flickering in a single horizontal row, the exact same lantern in every frame` |

### 4.3 Врата главы (`assets/sprites/portal.png`), кадр 96×96, файл 768×96
ОПИСАНИЕ: `ancient magical portal gate, ring of carved violet stone with six glowing golden runes, soft radiant golden light swirling inside the ring, standing on ground`
- idle (8, 10 fps): `sprite sheet, 8 frames in a single horizontal row, the exact same portal in every frame, the six runes rotated one step further in each frame, inner glow pulsing`

---

## 5. Тайлсеты (без анимации — одна картинка на главу)

Файл **192×32**: шесть тайлов 32×32 в ряд:
[0] земля-верх, [1] земля-внутри, [2] тонкая платформа, [3] шипы, [4] декор-1, [5] декор-2.
Тайлы 0–2 бесшовные по горизонтали. К каждому промту добавь СТИЛЬ.

- `assets/tiles/ch1.png`: `2D platformer tileset strip of six separate 32x32 tiles side by side in one row: mossy forest ground top with muted green grass edge, dark soil fill tile, thin wooden platform ledge, pale bone-like spikes, glowing pink mushroom, curled fern sprout, seamless tiling`
- `assets/tiles/ch2.png`: `2D platformer tileset strip of six separate 32x32 tiles side by side in one row: dark violet cave stone top with faint amethyst glow edge, deep purple rock fill tile, thin crystal platform ledge, sharp pale crystal spikes, large glowing cyan crystal, small geode cluster, seamless tiling`
- `assets/tiles/ch3.png`: `2D platformer tileset strip of six separate 32x32 tiles side by side in one row: ancient pale blue-grey castle masonry top edge, weathered stone brick fill tile, thin marble platform ledge, golden spear spikes, broken marble column piece, glowing golden rune tablet, seamless tiling`

---

## 6. Фоны (без анимации — одна картинка на слой, 9 файлов)

`sky` — 960×540 непрозрачный; `far`/`near` — 1024×540, прозрачный фон,
**бесшовные по горизонтали** (тайлятся при параллаксе).

Глава 1 (`assets/bg/ch1_*.png`):
- sky: `twilight forest sky background, deep blue-teal vertical gradient, pale full moon, scattered faint fireflies and stars, hand-painted 2D game background`
- far: `layer of distant dark tree silhouettes, thin trunks and round crowns, seamless horizontal tiling, transparent background, hand-painted 2D game parallax layer`
- near: `large gnarled tree trunks and twisted branches silhouettes with hanging moss, seamless horizontal tiling, transparent background, hand-painted 2D game parallax layer`

Глава 2 (`assets/bg/ch2_*.png`):
- sky: `dark violet cave depth background, near-black purple vertical gradient, faint glowing crystal dust particles, hand-painted 2D game background`
- far: `distant stalagmite and stalactite silhouettes with faint cyan crystal glow, seamless horizontal tiling, transparent background`
- near: `large dark cave rock formations and glowing amethyst crystal clusters silhouettes, seamless horizontal tiling, transparent background`

Глава 3 (`assets/bg/ch3_*.png`):
- sky: `dawn sky above the clouds background, soft blue to warm golden vertical gradient, glowing rising sun, hand-painted 2D game background`
- far: `distant floating islands and soft cloud banks silhouettes, seamless horizontal tiling, transparent background`
- near: `ruined sky citadel towers and large dramatic clouds silhouettes, seamless horizontal tiling, transparent background`

---

## 7. Звук и музыка (на будущее; сейчас SFX процедурные)

Лупы 60–90 сек (Suno/Udio), ogg/mp3:
- Гл. 1: `melancholic fairy-tale forest ambient, music box and soft strings, mysterious, calm loop, game background music`
- Гл. 2: `crystal cave ambient, glass-like bells, deep reverb drones, wonder and echo, loop`
- Гл. 3: `airy heroic finale, soft choir and harp above the clouds, hopeful, loop`
- Меню: `quiet lullaby theme, single music box melody, warm and sad`

---

## 8. Как сдавать результаты

Присылай сгенерированные картинки Клоду как есть — он нарежет кадры,
выровняет их, соберёт спрайт-листы точной раскладки, положит в `assets/` и
при необходимости подгонит `js/config.js` (размер кадра, число кадров, fps).
