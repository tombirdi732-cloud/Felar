#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор инструментального хип-хоп бита — lyrical type beat 2010-2012.

85 BPM, F# минор, меланхоличное пиано, соул-чоп, boom-bap барабаны и
808-суб. Пишет MIDI для FL Studio. Библиотеки не нужны.

    python3 generate_boombap.py                 # rainy_night_85.mid
    python3 generate_boombap.py --key Dm        # другая тональность
    python3 generate_boombap.py --bpm 88
    python3 generate_boombap.py --guide         # что вешать в FL

Структура (64 такта, ~3:00):
    Intro 8 -> Verse 16 -> Hook 8 -> Verse 16 -> Hook 8 -> Outro 8

Дорожки: Piano (гармония), Piano Melody (мотив), Soul Chop, 808 Sub,
Drums. Винил и шум ленты — это шумовые слои, нот у них нет: их делает
рендерер (render_boombap.py) или плагин в FL.
"""

import argparse
import random

from midi_writer import DRUM_CHANNEL, Part, write_midi

DEFAULT_BPM = 85
DEFAULT_KEY = "F#m"
OUT_FILE = "rainy_night_85.mid"

BASE_KEY_ROOT = 6          # F#

# Прогрессия i - VI - III - v. Минорная пятая ступень (C#m) вместо мажорной
# не даёт разрешения — отсюда ощущение незакрытости и меланхолии.
# Надстройки (9-е, maj7) — то, что делает пиано «дождливым», а не пустым.
CHORDS = [
    # имя,      левая рука,  правая рука,          суб (808)
    ("F#m9",   [42, 49], [57, 61, 64, 68], 30),   # F# C# | A C# E G#
    ("Dmaj9",  [38, 45], [54, 57, 61, 64], 26),   # D  A  | F# A C# E
    ("Amaj9",  [45, 52], [61, 64, 68, 71], 33),   # A  E  | C# E G# B
    ("C#m11",  [37, 44], [52, 59, 61, 66], 25),   # C# G# | E B C# F#
]

NOTE_NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
              "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
              "A#": 10, "Bb": 10, "B": 11}

# Рисунок пиано: (доля, рука, индекс голоса, длительность).
# Ломаный аккорд, а не блок — так играют в этом жанре. Педаль держим
# длинными нотами, поэтому звуки наслаиваются.
PIANO_A = [
    (0.0, "L", 0, 2.0), (0.0, "R", 0, 1.0), (0.5, "R", 2, 0.5),
    (1.0, "R", 1, 0.5), (1.5, "R", 3, 1.0),
    (2.0, "L", 1, 2.0), (2.5, "R", 0, 0.5), (3.0, "R", 2, 0.5),
    (3.5, "R", 1, 0.5),
]
PIANO_B = [
    (0.0, "L", 0, 2.0), (0.0, "R", 3, 1.5), (1.5, "R", 2, 0.5),
    (2.0, "L", 1, 1.5), (2.0, "R", 1, 0.5), (2.5, "R", 3, 1.0),
    (3.5, "R", 0, 0.5),
]

# Мотив сверху — то, что делает бит узнаваемым. Много воздуха: под это
# читают, поэтому мелодия не занимает весь такт.
MELODY = [
    [(0, 1.5, 73), (1.5, .5, 76), (2, 2, 78)],                 # C#5 E5 F#5
    [(0, 1, 76), (1, .5, 74), (1.5, 1.5, 73), (3, 1, 69)],     # E5 D5 C#5 A4
    [(0, 1.5, 71), (1.5, .5, 73), (2, 2, 76)],                 # B4 C#5 E5
    [(0, 1, 73), (1, 1, 71), (2, 2, 68)],                      # C#5 B4 G#4
]

# Соул-чоп: тёплые долгие ноты, отвечают мелодии в паузах.
CHOP = [
    [(2.5, 1.5, 64)],
    [(0, 2, 61), (2.5, 1.5, 64)],
    [(2.5, 1.5, 68)],
    [(0, 2, 66), (2.5, 1.5, 61)],
]

# 808: длинные ноты, подъезд по корню. В этом жанре бас не суетится.
SUB_PATTERN = [(0, 2.4, 0), (2.5, 1.4, 0)]
SUB_PATTERN_B = [(0, 1.9, 0), (2.0, 0.9, 0), (3.25, 0.7, 0)]

# Барабаны (GM)
KICK, SNARE, CLAP, RIM, HAT, OPENHAT, RIDE = 36, 38, 39, 37, 42, 46, 51

# Boom bap: бочка синкопирована, малый строго на 2 и 4.
KICK_A = [0.0, 0.75, 2.5]
KICK_B = [0.0, 1.75, 2.5, 3.5]

SWING = 0.055              # сдвиг «слабых» восьмых, в долях (~56% MPC)

# Бочка и малый играют чуть позади сетки — это и есть «карман» жанра.
# 0.025 доли на 85 BPM = ~18 мс: ровно тот диапазон, в котором барабаны
# перестают звучать механически, но ещё не разваливаются.
LAYBACK = 0.025

# ------------------------------------------------------------- структура

SECTIONS = [
    ("Intro",   8,  dict(piano=True, melody=True, chop=False, drums=False,
                         sub=False, energy=.86, intro=True)),
    ("Verse 1", 16, dict(piano=True, melody=True, chop=True, drums=True,
                         sub=True, energy=.88)),
    ("Hook 1",  8,  dict(piano=True, melody=True, chop=True, drums=True,
                         sub=True, energy=1.0, lift=True)),
    ("Verse 2", 16, dict(piano=True, melody=True, chop=True, drums=True,
                         sub=True, energy=.90)),
    ("Hook 2",  8,  dict(piano=True, melody=True, chop=True, drums=True,
                         sub=True, energy=1.0, lift=True)),
    ("Outro",   8,  dict(piano=True, melody=True, chop=True, drums=False,
                         sub=False, energy=.80, fade=True)),
]

rng = random.Random(1204)


def hum(vel, spread=6):
    """Разброс громкости: живая игра, а не квантованная сетка."""
    return vel + rng.randint(-spread, spread)


def swung(beat):
    """Лёгкий свинг: слабые шестнадцатые чуть опаздывают."""
    return beat + (SWING if abs(beat * 2 - round(beat * 2)) > 1e-6 else 0.0)


# ------------------------------------------------------------------ слои

def add_piano(part, bar_beat, chord, pattern, vel, octave=0):
    hands = {"L": chord[1], "R": chord[2]}
    for beat, hand, idx, dur in pattern:
        pitch = hands[hand][idx] + octave
        # правая рука тише левой и мягче на слабых долях
        v = vel - (0 if hand == "L" else 8) - (6 if beat % 1 else 0)
        # длительности щедрые: педаль не глушит предыдущую ноту
        part.add(bar_beat + swung(beat), dur * 1.6, pitch, hum(v))


def add_melody(part, bar_beat, bar_notes, vel, octave=0):
    for beat, dur, pitch in bar_notes:
        part.add(bar_beat + beat, dur * 1.25, pitch + octave, hum(vel))


def add_chop(part, bar_beat, bar_notes, vel):
    for beat, dur, pitch in bar_notes:
        part.add(bar_beat + beat, dur, pitch, hum(vel, 4))


def add_sub(part, bar_beat, chord, pattern, vel):
    root = chord[3]
    for beat, dur, shift in pattern:
        part.add(bar_beat + beat, dur, root + shift, hum(vel, 4))


def add_drums(part, bar_beat, vel, bar_index, lift=False):
    for beat in (KICK_B if bar_index % 4 == 3 else KICK_A):
        part.add(bar_beat + beat + LAYBACK, .4, KICK, hum(vel))

    for beat in (1.0, 3.0):                       # малый на 2 и 4
        b = bar_beat + beat + LAYBACK
        part.add(b, .5, SNARE, hum(vel + 2))
        # клэп подкладкой на пару миллисекунд позже — малый становится
        # шире и «хрустит», один сэмпл такого не даёт
        part.add(b + 0.004, .3, CLAP, hum(vel - 20))

    # Хэты восьмыми со свингом. Держим их в верхней половине шкалы
    # (примерно 60-100% velocity): акцентные почти на полную, призрачные
    # заметно тише. Ровные хэты сразу выдают машину.
    accent = 76 + (vel / 100.0) * 42
    ghost = 76 + (accent - 76) * 0.35
    for i in range(8):
        b = swung(i * 0.5)
        part.add(bar_beat + b, .16, HAT,
                 hum(accent if i % 2 == 0 else ghost, 9))

    roll_here = bar_index % 4 == 3 or (lift and bar_index % 2 == 1)
    if roll_here:
        # Лёгкий рол: шестнадцатые или тридцать вторые с нарастанием.
        # Идёт от «призрачной» громкости к акцентной — рол должен быть
        # слышен как приём, а не проваливаться под основную сетку.
        step = .125 if bar_index % 8 == 7 else .25
        n = int(1.0 / step)
        for i in range(n):
            part.add(bar_beat + 3.0 + i * step, step * .7, HAT,
                     hum(ghost + (accent - ghost) * i / max(1, n - 1), 6))
    if bar_index % 8 == 7:
        part.add(bar_beat + 3.5, .4, OPENHAT, hum(vel - 14))


# -------------------------------------------------------------- сборка

def build_beat(bpm=DEFAULT_BPM, key=DEFAULT_KEY):
    shift = transpose_shift(key)
    chords = [(n, [p + shift for p in lh], [p + shift for p in rh], s + shift)
              for n, lh, rh, s in CHORDS]

    parts = {
        # program — GM-тембр, нужен только для превью; в FL ставишь свой инструмент
        "piano":  Part("Piano", program=0, channel=0, volume=100, role="piano"),
        "melody": Part("Piano Melody", program=0, channel=1, pan=70, volume=104,
                       role="melody"),
        "chop":   Part("Soul Chop", program=52, channel=2, pan=58, volume=82,
                       role="chop"),
        "sub":    Part("808 Sub", program=38, channel=3, volume=112, role="sub"),
        "drums":  Part("Drums", channel=DRUM_CHANNEL, volume=106, role="drums"),
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
            if cfg.get("fade"):
                v *= 1.0 - .55 * bar / max(1, bars - 1)
            if cfg.get("intro"):              # интро вкатывается
                v *= .70 + .30 * bar / max(1, bars - 1)

            if cfg.get("piano"):
                pat = PIANO_B if bar % 4 in (1, 3) else PIANO_A
                add_piano(parts["piano"], b, chord, pat, 78 * v)
                if cfg.get("lift"):           # в хуке дублируем октавой выше
                    add_piano(parts["piano"], b, chord, pat, 52 * v, octave=12)
            if cfg.get("melody"):
                add_melody(parts["melody"], b, MELODY[bar % 4], 88 * v)
            if cfg.get("chop"):
                add_chop(parts["chop"], b, CHOP[bar % 4],
                         (84 if cfg.get("lift") else 68) * v)
            if cfg.get("sub"):
                pat = SUB_PATTERN_B if bar % 4 == 3 else SUB_PATTERN
                add_sub(parts["sub"], b, chord, pat, 104 * v)
            if cfg.get("drums"):
                add_drums(parts["drums"], b, 100 * v, bar, cfg.get("lift", False))

        beat += bars * 4

    return list(parts.values()), markers, int(beat // 4)


def transpose_shift(key):
    name = key.strip().rstrip("m").replace("min", "") or "F#"
    name = name[0].upper() + name[1:]
    if name not in NOTE_NAMES:
        raise SystemExit(f"Не знаю тональность {key!r}. Примеры: F#m, Dm, Am, Cm")
    shift = NOTE_NAMES[name] - BASE_KEY_ROOT
    return shift - 12 if shift > 6 else (shift + 12 if shift < -6 else shift)


SOUND_GUIDE = """
Что вешать на дорожки в FL Studio:

  Piano          рояль — FL Keys (пресет Bright Piano, убрать яркость) или
                 любой сэмплерный Grand. Reverb: Fruity Reeverb 2, hall,
                 wet ~18%, decay 1.8 c, срез верха ~7 кГц — «подвал», а не
                 концертный зал. Сверху лёгкий ФНЧ на 12-14 кГц: это и даёт
                 ощущение старой записи.
  Piano Melody   тот же рояль, чуть громче и правее по панораме.
  Soul Chop      нарезанный вокальный сэмпл в Slicex, или синт-пад с
                 формантами. Тёплый: срез верха ~5 кГц, реверб побольше
                 (wet 30%), громкость низкая — он должен быть «за» пиано.
  808 Sub        3xOsc, одна синусоида, моно, ФНЧ ~110 Гц. Долгий decay,
                 лёгкая сатурация. Слегка приглушать под бочкой (ducking
                 через Fruity Limiter), иначе низ дерётся.
  Drums          бочка и малый из boom-bap пака (не EDM!). Малый должен
                 быть резким и коротким. Хэты тише, чуть в стороны.

Отдельно — атмосфера, без неё бит звучит стерильно:
  Винил и шум ленты   плагин RC-20 Retro Color или сэмпл vinyl crackle на
                      отдельном канале, громкость -28..-24 dB. Постоянно,
                      включая паузы между секциями.
  Сатурация на мастер  Fruity Soft Clipper или ленточная эмуляция, чуть-чуть.

Мастер: Fruity Limiter, пик -1 dB. Хип-хоп не жмут так же сильно, как EDM:
средняя громкость -11..-9 LUFS, чтобы дышало.
"""


def main():
    ap = argparse.ArgumentParser(description="Генератор lyrical type beat")
    ap.add_argument("--bpm", type=int, default=DEFAULT_BPM)
    ap.add_argument("--key", default=DEFAULT_KEY, help="например F#m, Dm, Am")
    ap.add_argument("--out", default=OUT_FILE)
    ap.add_argument("--guide", action="store_true")
    args = ap.parse_args()

    parts, markers, bars = build_beat(args.bpm, args.key)
    write_midi(args.out, parts, args.bpm,
               title=f"Lyrical Type Beat {args.key} {args.bpm}BPM", markers=markers)

    seconds = bars * 4 * 60 / args.bpm
    print(f"Готово: {args.out}")
    print(f"{args.key}, {args.bpm} BPM, {bars} тактов, "
          f"~{int(seconds//60)}:{int(seconds%60):02d}")
    print("Секции: " + " -> ".join(f"{n}({b})" for n, b, _ in SECTIONS))
    print("Дорожки: " + ", ".join(p.name for p in parts if p.notes))
    if args.guide:
        print(SOUND_GUIDE)
    else:
        print("\nГайд по инструментам: python3 generate_boombap.py --guide")


if __name__ == "__main__":
    main()
