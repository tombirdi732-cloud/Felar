#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор клубного EDM-трека: future bass, dubstep-бас или bass house.

Собирает полную аранжировку (интро -> билд -> дроп -> ...) и пишет MIDI
для FL Studio. Библиотеки не нужны.

    python3 generate_edm.py                    # future bass, 150 BPM
    python3 generate_edm.py --style bass       # тяжёлый гроул-дроп, 140
    python3 generate_edm.py --style house      # bass house, 128, бочка в пол
    python3 generate_edm.py --key Am --bpm 145
    python3 generate_edm.py --guide            # что вешать на дорожки в FL

Бас разложен на три слоя — так делают в клубной музыке, чтобы низ был
слышен и на телефоне, и на большой системе:
    Sub Bass 808   чистый синус, 30-60 Гц, только фундамент
    Reese Bass     расстроенные пилы 80-400 Гц с вобблом — весь «рык»
    Bass Stabs     короткие акценты в верхнем басу, держат ритм
"""

import argparse
import random

from midi_writer import DRUM_CHANNEL, Part, write_midi

DEFAULT_KEY = "Fm"
OUT_FILE = "marshmello_style.mid"

# Прогрессия i - VI - III - VII с надстройками: рабочая лошадка жанра.
# Записана для Fm, остальные тональности получаются транспонированием.
BASE_KEY_ROOT = 5          # F

CHORDS = [
    # имя,        голоса аккорда,        суб,  reese,  арпеджио
    ("Fm9",     [53, 56, 60, 63, 67], 29, 41, [65, 68, 72, 75]),
    ("Dbmaj9",  [49, 53, 56, 60, 63], 25, 37, [61, 65, 68, 72]),
    ("Abmaj9",  [56, 60, 63, 67, 70], 32, 44, [68, 72, 75, 79]),
    ("Eb7sus4", [51, 56, 58, 61, 65], 27, 39, [63, 68, 70, 73]),
]

NOTE_NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
              "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
              "A#": 10, "Bb": 10, "B": 11}

# ------------------------------------------------------------------- стили

STYLES = {
    "future": dict(
        bpm=150, label="Future bass (Marshmello)",
        drop_chords="drop", drop_bass="future", drop_drums="halftime",
        verse_drums="verse", lead_in_drop=True),
    "bass": dict(
        bpm=140, label="Bass / dubstep-дроп",
        drop_chords="sparse", drop_bass="growl", drop_drums="halftime",
        verse_drums="verse", lead_in_drop=False),
    "house": dict(
        bpm=128, label="Bass house / клубный",
        drop_chords="stab", drop_bass="house", drop_drums="four",
        verse_drums="four_light", lead_in_drop=True),
}

# Ритм аккордовых стабов. «Пунктирные» восьмые (сетка 0,3,6,9,11,13 по
# шестнадцатым) — та самая синкопа, которая качает дроп.
CHORD_RHYTHMS = {
    "drop":   [(0, .70), (.75, .70), (1.5, .70), (2.25, .45), (2.75, .45), (3.25, .75)],
    "stab":   [(0, .45), (1, .45), (1.5, .45), (2.5, .45), (3, .45), (3.5, .45)],
    "sparse": [(0, 1.2), (2, 1.2)],          # редко — освобождаем место басу
    "verse":  [(0, 1.4), (1.5, .9), (2.5, 1.4)],
}

# Басовые рисунки: (доля, длительность, сдвиг в полутонах от корня).
BASS_PATTERNS = {
    # future bass: бас копирует стабы аккордов, снизу подпирает суб
    "future": [(0, .70, 0), (.75, .70, 0), (1.5, .70, 0),
               (2.25, .45, 0), (2.75, .45, 12), (3.25, .75, 0)],
    # dubstep-гроул: рваный рисунок с прыжками на октаву и квинту
    "growl":  [(0, .45, 0), (.5, .45, 0), (1, .45, 12), (1.5, .45, 0),
               (2, .45, 0), (2.5, .22, 0), (2.75, .22, 7), (3, .45, 0),
               (3.5, .45, 12)],
    # bass house: офбит — бас строго между ударами бочки
    "house":  [(.5, .42, 0), (1.5, .42, 0), (2.5, .42, 0), (3.5, .42, 12)],
    "verse":  [(0, 1.4, 0), (1.5, .9, 0), (2.5, 1.4, 0)],
}

# Мелодия дропа: 8 тактов, простая и повторяющаяся — как и положено хуку.
DROP_LEAD = [
    [(0, 1.5, 80), (1.5, .5, 79), (2, 1, 77), (3, 1, 72)],            # Fm9
    [(0, 1.5, 77), (1.5, .5, 80), (2, 2, 84)],                        # Dbmaj9
    [(0, 1, 87), (1, .5, 84), (1.5, .5, 82), (2, 2, 80)],             # Abmaj9
    [(0, 1, 82), (1, .5, 80), (1.5, .5, 77), (2, 2, 75)],             # Eb7sus4
    [(0, 1.5, 80), (1.5, .5, 79), (2, 1, 77), (3, 1, 72)],            # Fm9
    [(0, 1.5, 77), (1.5, .5, 80), (2, 2, 84)],                        # Dbmaj9
    [(0, .5, 87), (.5, .5, 84), (1, .5, 87), (1.5, .5, 89), (2, 2, 87)],  # Abmaj9
    [(0, 1, 84), (1, 1, 82), (2, 2, 80)],                             # Eb7sus4
]

# Вокал-чопы: под них в FL кидаешь нарезанный вокал в Slicex.
CHOP_LINE = [
    [(0, .5, 72), (.75, .5, 75), (1.5, .5, 72), (2.25, .5, 68), (3, .75, 72)],
    [(0, .5, 72), (.75, .5, 68), (1.5, .5, 65), (2.25, .5, 68), (3, .75, 72)],
    [(0, .5, 75), (.75, .5, 79), (1.5, .5, 75), (2.25, .5, 72), (3, .75, 75)],
    [(0, .5, 73), (.75, .5, 70), (1.5, .5, 68), (2.25, .5, 70), (3, .75, 68)],
]

# Барабаны (GM)
KICK, SNARE, CLAP, HAT, OPENHAT, CRASH, RIDE = 36, 38, 39, 42, 46, 49, 51

# --------------------------------------------------------- структура трека

SECTIONS = [
    ("Intro",      8,  dict(chords="pad",  arp=True, drums=None,    bass="sub",  energy=.55)),
    ("Verse 1",    8,  dict(chords="verse", arp=True, drums="verse", bass="verse", chops=True, energy=.70)),
    ("Build 1",    8,  dict(chords="pad",  arp=True, drums="build", bass="sub",  energy=.85, build=True)),
    ("Drop 1",     16, dict(chords="drop", lead=True, drums="drop", bass="drop", chops=True, energy=1.0, crash=True)),
    ("Breakdown",  8,  dict(chords="pad",  arp=True, drums=None,    bass="sub",  energy=.50)),
    ("Verse 2",    8,  dict(chords="verse", arp=True, drums="verse", bass="verse", chops=True, energy=.72)),
    ("Build 2",    8,  dict(chords="pad",  arp=True, drums="build", bass="sub",  energy=.90, build=True)),
    ("Drop 2",     16, dict(chords="drop", lead=True, drums="drop", bass="drop", chops=True, energy=1.0, crash=True)),
    ("Outro",      8,  dict(chords="pad",  arp=True, drums=None,    bass="sub",  energy=.45, fade=True)),
]

rng = random.Random(808)


def hum(vel, spread=5):
    """Небольшой разброс громкости — иначе партия звучит механически."""
    return vel + rng.randint(-spread, spread)


# --------------------------------------------------------------- слои

def add_chords(part, bar_beat, chord, mode, vel):
    voices = chord[1]
    if mode == "pad":
        for i, pitch in enumerate(voices):
            part.add(bar_beat, 4.0, pitch, hum(vel - i * 2))
        return
    for beat, dur in CHORD_RHYTHMS[mode]:
        for i, pitch in enumerate(voices):
            part.add(bar_beat + beat, dur, pitch, hum(vel - i * 3))


def add_lead(part, bar_beat, bar_notes, vel):
    """Мелодия дропа + питч-бенд «заезд» — как портаменто в Serum."""
    for j, (beat, dur, pitch) in enumerate(bar_notes):
        part.add(bar_beat + beat, dur * .97, pitch, hum(vel))
        if j == 0:
            part.bend(bar_beat + beat - .1, -2400)
            part.bend(bar_beat + beat + .12, 0)


def add_arp(part, bar_beat, chord, vel, energy):
    arp = chord[4]
    seq = arp + arp[::-1][1:-1]           # вверх и обратно, без повтора краёв
    for i in range(16):
        v = vel + (6 if i % 4 == 0 else -4)
        part.add(bar_beat + i * .25, .22, seq[i % len(seq)], hum(v * energy))


def add_sub(part, bar_beat, chord, mode, vel, bass_pattern):
    """Суб-бас: только фундамент, длинные ноты. Рисунок — на reese."""
    root = chord[2]
    if mode in ("sub", "verse"):
        part.add(bar_beat, 3.9, root, hum(vel))
        return
    # в дропе суб идёт по опорным точкам басового рисунка, без мелких нот
    if bass_pattern == "house":
        for i in range(4):                # bass house: суб под каждой бочкой
            part.add(bar_beat + i, .9, root, hum(vel))
    else:
        part.add(bar_beat, 1.9, root, hum(vel))
        part.add(bar_beat + 2, 1.9, root, hum(vel - 4))


def add_reese(part, bar_beat, chord, pattern, vel):
    """Мид-бас/гроул — главный «жир» дропа. Живёт в 80-400 Гц."""
    root = chord[3]
    for beat, dur, shift in BASS_PATTERNS[pattern]:
        part.add(bar_beat + beat, dur, root + shift, hum(vel))


def add_chops(part, bar_beat, bar_notes, vel):
    for beat, dur, pitch in bar_notes:
        part.add(bar_beat + beat, dur, pitch, hum(vel))


def add_drums(part, bar_beat, style, vel, bar_index, total_bars, crash=False):
    if crash and bar_index == 0:
        part.add(bar_beat, 2, CRASH, hum(vel))

    if style == "verse":
        part.add(bar_beat, .5, KICK, hum(vel))
        part.add(bar_beat + 2.5, .5, KICK, hum(vel - 6))
        part.add(bar_beat + 2, .5, CLAP, hum(vel - 4))
        for i in range(8):
            part.add(bar_beat + i * .5, .2, HAT, hum(vel - (14 if i % 2 else 24)))

    elif style == "four_light":
        for i in range(4):
            part.add(bar_beat + i, .5, KICK, hum(vel - 8))
        part.add(bar_beat + 1, .5, CLAP, hum(vel - 6))
        part.add(bar_beat + 3, .5, CLAP, hum(vel - 6))
        for i in range(4):                # офбит-хэт — пульс хауса
            part.add(bar_beat + i + .5, .25, OPENHAT, hum(vel - 22))

    elif style == "four":
        # bass house: бочка в пол, клэп на 2 и 4, открытый хэт на офбите
        for i in range(4):
            part.add(bar_beat + i, .5, KICK, hum(vel))
        part.add(bar_beat + 1, .5, CLAP, hum(vel - 2))
        part.add(bar_beat + 3, .5, CLAP, hum(vel - 2))
        for i in range(4):
            part.add(bar_beat + i + .5, .3, OPENHAT, hum(vel - 16))
        for i in range(8):
            part.add(bar_beat + i * .5 + .25, .12, HAT, hum(vel - 30))
        if bar_index % 4 == 3:
            for i in range(4):
                part.add(bar_beat + 3 + i * .25, .2, SNARE, hum(vel - 22 + i * 6))

    elif style == "halftime":
        # бочка на 1, клэп на 3 — дроп звучит вдвое медленнее и тяжелее
        part.add(bar_beat, .5, KICK, hum(vel))
        part.add(bar_beat + 1.75, .5, KICK, hum(vel - 12))
        part.add(bar_beat + 2, .5, CLAP, hum(vel))
        part.add(bar_beat + 2, .5, SNARE, hum(vel - 18))
        for i in range(16):
            if i % 4 == 2:
                continue                  # дырки в сетке — живее звучит
            part.add(bar_beat + i * .25, .12, HAT,
                     hum(vel - (10 if i % 4 == 0 else 26)))
        part.add(bar_beat + 3.5, .4, OPENHAT, hum(vel - 16))
        if bar_index % 4 == 3:
            for i in range(4):
                part.add(bar_beat + 3 + i * .25, .2, SNARE, hum(vel - 20 + i * 6))

    elif style == "build":
        # нарастающая дробь: восьмые -> шестнадцатые -> тридцать вторые
        frac = bar_index / max(1, total_bars - 1)
        step = .5 if frac < .4 else (.25 if frac < .78 else .125)
        n = int(4 / step)
        for i in range(n):
            v = vel - 26 + int(30 * (frac * .6 + (i / n) * .4))
            part.add(bar_beat + i * step, step * .8, SNARE, hum(v))
        if bar_index < total_bars - 2:    # бочка уходит в последних тактах
            for i in range(4):
                part.add(bar_beat + i, .5, KICK, hum(vel - 10))
        if bar_index == total_bars - 1:
            part.add(bar_beat + 3.5, .5, CRASH, hum(vel))


# ------------------------------------------------------------- сборка трека

def build_song(bpm=None, key=DEFAULT_KEY, style="future"):
    """Собрать все партии. Возвращает (parts, markers, bars, bpm)."""
    if style not in STYLES:
        raise SystemExit(f"Не знаю стиль {style!r}. Есть: {', '.join(STYLES)}")
    st = STYLES[style]
    bpm = bpm or st["bpm"]

    shift = transpose_shift(key)
    chords = [(n, [p + shift for p in v], sub + shift, ree + shift,
               [a + shift for a in arp]) for n, v, sub, ree, arp in CHORDS]

    parts = {
        # program — GM-тембр, важен только для превью: в FL ты ставишь свой синт
        "chords": Part("Supersaw Chords", program=81, channel=0, volume=98, role="chords"),
        "lead":   Part("Lead", program=81, channel=1, volume=110, role="lead"),
        "arp":    Part("Pluck / Arp", program=82, channel=2, pan=54, volume=86, role="pluck"),
        "chops":  Part("Vocal Chops", program=54, channel=3, pan=74, volume=90, role="chops"),
        "reese":  Part("Reese / Growl Bass", program=39, channel=4, volume=112, role="reese"),
        "sub":    Part("Sub Bass 808", program=38, channel=5, volume=112, role="sub"),
        "drums":  Part("Drums", channel=DRUM_CHANNEL, volume=104, role="drums"),
    }

    markers = []
    beat = 0.0
    for name, bars, cfg in SECTIONS:
        markers.append((beat, f"{name} [{style}]"))
        energy = cfg.get("energy", 1.0)
        in_drop = cfg.get("bass") == "drop"

        for bar in range(bars):
            chord = chords[bar % 4]
            b = beat + bar * 4
            v = energy
            if cfg.get("fade"):
                v *= 1.0 - .7 * bar / max(1, bars - 1)
            if cfg.get("build"):
                v *= .75 + .45 * bar / max(1, bars - 1)

            mode = cfg.get("chords")
            if mode == "drop":
                mode = st["drop_chords"]
            if mode:
                add_chords(parts["chords"], b, chord, mode, 90 * v)

            if cfg.get("lead") and st["lead_in_drop"]:
                add_lead(parts["lead"], b, DROP_LEAD[bar % 8], 104 * v)
            if cfg.get("arp"):
                add_arp(parts["arp"], b, chord, 78, v)
            if cfg.get("chops"):
                add_chops(parts["chops"], b, transpose_line(CHOP_LINE[bar % 4], shift), 86 * v)

            bass_pattern = st["drop_bass"] if in_drop else "verse"
            add_sub(parts["sub"], b, chord, cfg.get("bass", "sub"), 100 * v, bass_pattern)
            if in_drop or cfg.get("bass") == "verse":
                add_reese(parts["reese"], b, chord, bass_pattern,
                          (108 if in_drop else 82) * v)

            drums = cfg.get("drums")
            if drums == "drop":
                drums = st["drop_drums"]
            elif drums == "verse":
                drums = st["verse_drums"]
            if drums:
                add_drums(parts["drums"], b, drums, 100 * v, bar, bars,
                          crash=cfg.get("crash", False))

        beat += bars * 4

    return list(parts.values()), markers, int(beat // 4), bpm


def transpose_shift(key):
    """Сдвиг в полутонах от базовой Fm к запрошенной тональности."""
    name = key.strip().rstrip("m").replace("min", "") or "F"
    name = name[0].upper() + name[1:]
    if name not in NOTE_NAMES:
        raise SystemExit(f"Не знаю тональность {key!r}. Примеры: Fm, Am, C#m, Gm")
    shift = NOTE_NAMES[name] - BASE_KEY_ROOT
    return shift - 12 if shift > 6 else (shift + 12 if shift < -6 else shift)


def transpose_line(line, shift):
    return [(b, d, p + shift) for b, d, p in line]


SOUND_GUIDE = """
Что вешать на дорожки в FL Studio (это и делает клубный звук):

  Reese / Growl Bass  ГЛАВНЫЙ бас. Serum: 2-3 пилы, unison 4-6, detune ~20%.
                      LFO на частоту фильтра, ритм 1/8 или 1/16 — это и есть
                      воббл/рык. Сверху дисторшн (Fruity Blood Overdrive или
                      Distructor). Обрежь всё ниже 80 Гц: там живёт суб.
                      Обязательно моно ниже 200 Гц, иначе низ развалится.
  Sub Bass 808        чистая синусоида (3xOsc, только Sine), строго моно,
                      фильтр ниже 100 Гц. Никакого дисторшна и реверба.
                      Жёсткий сайдчейн от бочки.
  Supersaw Chords     супер-пила: unison 7 голосов, detune ~25%, blend ~70%.
                      Сайдчейн от бочки — этот пампинг и есть половина жанра.
  Lead                та же пила, но ярче + Portamento/Glide 20-40 мс,
                      Fruity Delay 3 (1/4 точка) и реверб.
  Pluck / Arp         короткая пила, decay ~200 мс, delay 1/8.
  Vocal Chops         Slicex или Fruity Granulizer с нарезанным вокалом.
  Drums               бочка + клэп из EDM-пака, хэты шире по панораме.

Про бас важное: суб и reese НЕ должны играть в одном диапазоне, иначе низ
превращается в кашу. Reese режем снизу (highpass 80-100 Гц), суб сверху
(lowpass 100 Гц).
Оба сайдчейнятся от бочки, иначе бочка утонет.

Мастер: Fruity Limiter, пик около -1 dB, средняя громкость -9..-8 LUFS.
"""


def main():
    ap = argparse.ArgumentParser(description="Генератор клубного EDM-трека")
    ap.add_argument("--style", default="future", choices=sorted(STYLES),
                    help="future / bass / house")
    ap.add_argument("--bpm", type=int, default=None)
    ap.add_argument("--key", default=DEFAULT_KEY, help="например Fm, Am, C#m")
    ap.add_argument("--out", default=None)
    ap.add_argument("--guide", action="store_true", help="показать гайд по звуку")
    args = ap.parse_args()

    parts, markers, bars, bpm = build_song(args.bpm, args.key, args.style)
    out = args.out or (OUT_FILE if args.style == "future" else f"{args.style}_style.mid")
    write_midi(out, parts, bpm,
               title=f"{STYLES[args.style]['label']} {args.key} {bpm}BPM",
               markers=markers)

    seconds = bars * 4 * 60 / bpm
    print(f"Готово: {out}")
    print(f"{STYLES[args.style]['label']} — {args.key}, {bpm} BPM, "
          f"{bars} тактов, ~{int(seconds//60)}:{int(seconds%60):02d}")
    print("Дорожки: " + ", ".join(p.name for p in parts if p.notes))
    if args.guide:
        print(SOUND_GUIDE)
    else:
        print("\nГайд по синтам и сайдчейну: python3 generate_edm.py --guide")


if __name__ == "__main__":
    main()
