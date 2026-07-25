#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор EDM-трека в стиле Marshmello / future bass.

Собирает полноценную аранжировку (интро -> куплет -> билд -> дроп -> ...)
и пишет MIDI-файл для FL Studio. Библиотеки не нужны.

    python3 generate_edm.py                  # marshmello_style.mid
    python3 generate_edm.py --key Am         # другая тональность
    python3 generate_edm.py --bpm 145        # другой темп

Что даёт скрипт: ноты — аккорды, мелодию дропа, арпеджио, суб-бас,
вокал-чопы и барабаны, уже разложенные по секциям.
Что делаешь ты в FL: вешаешь на каждую дорожку свой синт (Serum/Sytrus/
3xOsc), сайдчейн и эффекты — см. SOUND_GUIDE внизу файла.

Жанр по нотам: минорная прогрессия с надстройками (9-е ступени, sus4) —
именно эти «широкие» аккорды дают узнаваемое future-bass звучание.
"""

import argparse
import random

from midi_writer import DRUM_CHANNEL, Part, write_midi

# ------------------------------------------------------------------ базовое

DEFAULT_BPM = 150          # future bass обычно 145-155 (дроп звучит в half-time)
DEFAULT_KEY = "Fm"
OUT_FILE = "marshmello_style.mid"

# Прогрессия i - VI - III - VII в миноре: рабочая лошадка жанра.
# Ноты записаны для Fm; другие тональности получаются транспонированием.
BASE_KEY_ROOT = 5          # F

CHORDS = [
    # имя,        голоса аккорда (середина),  корень баса, арпеджио (октавой выше)
    ("Fm9",     [53, 56, 60, 63, 67], 29, [65, 68, 72, 75]),
    ("Dbmaj9",  [49, 53, 56, 60, 63], 25, [61, 65, 68, 72]),
    ("Abmaj9",  [56, 60, 63, 67, 70], 32, [68, 72, 75, 79]),
    ("Eb7sus4", [51, 56, 58, 61, 65], 27, [63, 68, 70, 73]),
]

NOTE_NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
              "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
              "A#": 10, "Bb": 10, "B": 11}

# Ритм аккордовых стабов в дропе — «пунктирные» восьмые (0, 3, 6, 9, 11, 13
# по сетке шестнадцатых). Именно эта синкопа даёт фирменный качающийся дроп.
DROP_STABS = [(0, .70), (.75, .70), (1.5, .70), (2.25, .45), (2.75, .45), (3.25, .75)]
VERSE_STABS = [(0, 1.4), (1.5, .9), (2.5, 1.4)]

# Мелодия дропа: 8 тактов, простая и повторяющаяся — как и положено хуку.
# Записана для Fm, ноты в 5-й октаве, чтобы резать сквозь аккорды.
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

# Вокал-чопы: короткая линия по верхним голосам аккордов (под неё в FL
# кидаешь нарезанный вокал в Slicex / Fruity Granulizer).
CHOP_LINE = [
    [(0, .5, 72), (.75, .5, 75), (1.5, .5, 72), (2.25, .5, 68), (3, .75, 72)],
    [(0, .5, 72), (.75, .5, 68), (1.5, .5, 65), (2.25, .5, 68), (3, .75, 72)],
    [(0, .5, 75), (.75, .5, 79), (1.5, .5, 75), (2.25, .5, 72), (3, .75, 75)],
    [(0, .5, 73), (.75, .5, 70), (1.5, .5, 68), (2.25, .5, 70), (3, .75, 68)],
]

# Барабаны (GM): kick 36, snare 38, clap 39, closed hat 42, open hat 46, crash 49
KICK, SNARE, CLAP, HAT, OPENHAT, CRASH, RIDE = 36, 38, 39, 42, 46, 49, 51

# --------------------------------------------------------- структура трека
# (название секции, тактов, набор слоёв)

SECTIONS = [
    ("Intro",      8,  dict(chords="pad",  arp=True,  drums=None,   sub="long",  energy=.55)),
    ("Verse 1",    8,  dict(chords="stab", arp=True,  drums="verse", sub="long", chops=True, energy=.70)),
    ("Build 1",    8,  dict(chords="pad",  arp=True,  drums="build", sub="long", energy=.85, build=True)),
    ("Drop 1",     16, dict(chords="drop", lead=True, drums="drop",  sub="drop", chops=True, energy=1.0, crash=True)),
    ("Breakdown",  8,  dict(chords="pad",  arp=True,  drums=None,    sub="long", energy=.50)),
    ("Verse 2",    8,  dict(chords="stab", arp=True,  drums="verse", sub="long", chops=True, energy=.72)),
    ("Build 2",    8,  dict(chords="pad",  arp=True,  drums="build", sub="long", energy=.90, build=True)),
    ("Drop 2",     16, dict(chords="drop", lead=True, drums="drop",  sub="drop", chops=True, energy=1.0, crash=True)),
    ("Outro",      8,  dict(chords="pad",  arp=True,  drums=None,    sub="long", energy=.45, fade=True)),
]

rng = random.Random(808)


def hum(vel, spread=5):
    """Небольшой разброс громкости — иначе partия звучит механически."""
    return vel + rng.randint(-spread, spread)


# --------------------------------------------------------------- слои

def add_chords(part, bar_beat, chord, mode, vel):
    """Аккорды. pad — целый такт, stab/drop — ритмические стабы."""
    voices = chord[1]
    if mode == "pad":
        for i, pitch in enumerate(voices):
            part.add(bar_beat, 4.0, pitch, hum(vel - i * 2))
        return
    pattern = DROP_STABS if mode == "drop" else VERSE_STABS
    for beat, dur in pattern:
        for i, pitch in enumerate(voices):
            # верхние голоса чуть тише — так аккорд не «квадратный»
            part.add(bar_beat + beat, dur, pitch, hum(vel - i * 3))


def add_lead(part, bar_beat, bar_notes, vel):
    """Мелодия дропа + питч-бенд «заезд» в первую ноту фразы."""
    for j, (beat, dur, pitch) in enumerate(bar_notes):
        part.add(bar_beat + beat, dur * .97, pitch, hum(vel))
        if j == 0:                       # подъезд снизу, как портаменто в Serum
            part.bend(bar_beat + beat - .1, -2400)
            part.bend(bar_beat + beat + .12, 0)


def add_arp(part, bar_beat, chord, vel, energy):
    """Пluck-арпеджио шестнадцатыми: вверх-вниз по нотам аккорда."""
    arp = chord[3]
    seq = arp + arp[::-1][1:-1]          # вверх и обратно, без повтора краёв
    for i in range(16):
        pitch = seq[i % len(seq)]
        v = vel + (6 if i % 4 == 0 else -4)
        part.add(bar_beat + i * .25, .22, pitch, hum(v * energy))


def add_sub(part, bar_beat, chord, mode, vel):
    """Суб-бас/808 по корню аккорда."""
    root = chord[2]
    if mode == "long":
        part.add(bar_beat, 3.9, root, hum(vel))
    else:                                 # drop: повторы в такт с бочкой
        part.add(bar_beat, 1.4, root, hum(vel))
        part.add(bar_beat + 1.5, .4, root, hum(vel - 10))
        part.add(bar_beat + 2, 1.15, root, hum(vel))
        part.add(bar_beat + 3.25, .7, root, hum(vel - 6))


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
        for i in range(8):               # хэты восьмыми
            part.add(bar_beat + i * .5, .2, HAT, hum(vel - (14 if i % 2 else 24)))

    elif style == "drop":
        # half-time: бочка на 1, клэп на 3 — за счёт этого дроп «тяжёлый»
        part.add(bar_beat, .5, KICK, hum(vel))
        part.add(bar_beat + 1.75, .5, KICK, hum(vel - 12))
        part.add(bar_beat + 2, .5, CLAP, hum(vel))
        part.add(bar_beat + 2, .5, SNARE, hum(vel - 18))
        for i in range(16):              # хэты шестнадцатыми
            if i % 4 == 2:
                continue                 # дырки в сетке — живее звучит
            v = vel - (10 if i % 4 == 0 else 26)
            part.add(bar_beat + i * .25, .12, HAT, hum(v))
        part.add(bar_beat + 3.5, .4, OPENHAT, hum(vel - 16))
        if bar_index % 4 == 3:           # филл в конце четырёхтактия
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
        if bar_index < total_bars - 2:   # бочка уходит в последних тактах
            for i in range(4):
                part.add(bar_beat + i, .5, KICK, hum(vel - 10))
        if bar_index == total_bars - 1:
            part.add(bar_beat + 3.5, .5, CRASH, hum(vel))


# ------------------------------------------------------------- сборка трека

def build_song(bpm=DEFAULT_BPM, key=DEFAULT_KEY):
    """Собрать все партии. Возвращает (parts, markers, total_bars)."""
    shift = transpose_shift(key)
    chords = [(n, [p + shift for p in v], r + shift, [a + shift for a in arp])
              for n, v, r, arp in CHORDS]

    parts = {
        # program — GM-тембр: он важен только для превью, в FL ты ставишь свой синт
        "chords": Part("Supersaw Chords", program=81, channel=0, volume=100, role="chords"),
        "lead":   Part("Lead", program=81, channel=1, pan=64, volume=112, role="lead"),
        "arp":    Part("Pluck / Arp", program=82, channel=2, pan=54, volume=88, role="pluck"),
        "chops":  Part("Vocal Chops", program=54, channel=3, pan=74, volume=92, role="chops"),
        "sub":    Part("Sub Bass 808", program=38, channel=4, volume=110, role="sub"),
        "drums":  Part("Drums", channel=DRUM_CHANNEL, volume=104, role="drums"),
    }

    markers = []
    beat = 0.0
    for name, bars, cfg in SECTIONS:
        markers.append((beat, name))
        energy = cfg.get("energy", 1.0)

        for bar in range(bars):
            chord = chords[bar % 4]
            b = beat + bar * 4
            v = energy
            if cfg.get("fade"):                       # затухание в аутро
                v *= 1.0 - .7 * bar / max(1, bars - 1)
            if cfg.get("build"):                      # билд разгоняется к дропу
                v *= .75 + .45 * bar / max(1, bars - 1)

            if cfg.get("chords"):
                add_chords(parts["chords"], b, chord, cfg["chords"], 92 * v)
            if cfg.get("lead"):
                add_lead(parts["lead"], b, DROP_LEAD[bar % 8], 104 * v)
            if cfg.get("arp"):
                add_arp(parts["arp"], b, chord, 80, v)
            if cfg.get("chops"):
                add_chops(parts["chops"], b, transpose_line(CHOP_LINE[bar % 4], shift), 88 * v)
            if cfg.get("sub"):
                add_sub(parts["sub"], b, chord, cfg["sub"], 100 * v)
            if cfg.get("drums"):
                add_drums(parts["drums"], b, cfg["drums"], 100 * v, bar, bars,
                          crash=cfg.get("crash", False))

        beat += bars * 4

    return list(parts.values()), markers, int(beat // 4)


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
Что вешать на дорожки в FL Studio (это и делает звук «как у Marshmello»):

  Supersaw Chords  Serum/Sytrus, супер-пила: unison 7 голосов, detune ~25%,
                   blend ~70%. Обязательно сайдчейн от бочки (Fruity Peak
                   Controller или Fruity Limiter в режиме compressor) —
                   этот «пампинг» и есть половина жанра.
  Lead             та же супер-пила, но ярче + Portamento/Glide 20-40 мс,
                   сверху Fruity Delay 3 (1/4 точка) и реверб.
  Pluck / Arp      короткая пила, decay ~200 мс, delay 1/8. Играет в куплетах.
  Vocal Chops      Slicex или Fruity Granulizer с нарезанным вокалом.
                   Формант вверх, лёгкий реверб.
  Sub Bass 808     чистая синусоида (3xOsc), моно, ниже 100 Гц, жёсткий
                   сайдчейн от бочки.
  Drums            бочка + клэп из любого EDM-пака. Хэты — панорама шире.

Мастер: Fruity Limiter, пик около -1 dB, средняя громкость -9..-8 LUFS.
"""


def main():
    ap = argparse.ArgumentParser(description="Генератор EDM-трека (future bass)")
    ap.add_argument("--bpm", type=int, default=DEFAULT_BPM)
    ap.add_argument("--key", default=DEFAULT_KEY, help="например Fm, Am, C#m")
    ap.add_argument("--out", default=OUT_FILE)
    ap.add_argument("--guide", action="store_true", help="показать гайд по звуку")
    args = ap.parse_args()

    parts, markers, bars = build_song(args.bpm, args.key)
    write_midi(args.out, parts, args.bpm,
               title=f"Future Bass {args.key} {args.bpm}BPM", markers=markers)

    seconds = bars * 4 * 60 / args.bpm
    print(f"Готово: {args.out}")
    print(f"{args.key}, {args.bpm} BPM, {bars} тактов, ~{int(seconds//60)}:{int(seconds%60):02d}")
    print("Секции: " + " -> ".join(n for n, _, _ in SECTIONS))
    print("Дорожки: " + ", ".join(p.name for p in parts))
    if args.guide:
        print(SOUND_GUIDE)
    else:
        print("\nГайд по синтам и сайдчейну: python3 generate_edm.py --guide")


if __name__ == "__main__":
    main()
