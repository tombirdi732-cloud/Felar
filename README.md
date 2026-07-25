# Музыкальные генераторы

Скрипты, которые собирают аранжировки и пишут MIDI-файлы для FL Studio.
Зависимостей для MIDI не нужно — только Python 3. Для рендера в звук
нужны `numpy`, `scipy` и `lameenc`.

## EDM / future bass (стиль Marshmello)

```bash
python3 generate_edm.py                   # marshmello_style.mid
python3 generate_edm.py --key Am --bpm 145
python3 generate_edm.py --guide           # какие синты вешать в FL
python3 render_audio.py --out demo.mp3    # послушать до открытия FL
python3 render_audio.py --seconds 45      # быстрое превью
```

Структура: Intro → Verse → Build → **Drop** → Breakdown → Verse → Build →
**Drop** → Outro, 88 тактов (~2:20). Шесть дорожек: аккорды супер-пилой,
лид, пluck-арпеджио, вокал-чопы, суб-бас и барабаны.

## Гитарная песня «Я ведь не свят»

```bash
python3 generate_melody.py                # ya_ved_ne_svyat.mid
python3 generate_melody.py --no-drums
```

Em–C–G–D, 103 BPM. Темп, тональность и главный хук сняты с голосовой
записи автора.

## Как это попадает в FL Studio

1. Перетащи `.mid` в окно FL (или File → Import → MIDI file).
2. FL спросит про импорт — выбери разложить по отдельным каналам.
3. На каждый канал повесь свой синт или сэмплер. Ноты уже расставлены,
   остаётся звук: пресеты, сайдчейн, эффекты, мастеринг.

MIDI хранит только ноты — темп, длительности и высоту. Тембр, сведение и
мастеринг делаются в DAW, поэтому «звук как у Marshmello» получается из
связки: эти ноты + супер-пила + сайдчейн от бочки.

## Файлы

| Файл | Что делает |
|---|---|
| `midi_writer.py` | запись стандартного MIDI (SMF format 1), без зависимостей |
| `generate_edm.py` | аранжировка future bass → MIDI |
| `render_audio.py` | софт-синтезатор: рендер аранжировки в MP3/WAV |
| `generate_melody.py` | гитарная песня Em–C–G–D → MIDI |

Отрендеренное аудио (`*.mp3`, `*.wav`) не коммитится — оно всегда
пересобирается скриптом.
