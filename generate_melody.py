#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор гитарной мелодии для песни «Я ведь не свят» (Em | C | G | D).

Скрипт не требует никаких библиотек — он сам собирает стандартный
MIDI-файл (SMF format 1), который можно перетащить прямо в FL Studio.

Запуск:
    python3 generate_melody.py            # создаст ya_ved_ne_svyat.mid
    python3 generate_melody.py --no-drums # без барабанов, только гитары и бас

В FL Studio: File -> Import -> MIDI file (или просто перетащить .mid в окно).
Каждая дорожка ляжет на отдельный канал:
    1. Fingerpick Guitar  — акустический перебор (интро/куплеты/бридж)
    2. Rhythm Guitar      — ритм-гитара, пауэр-аккорды (припевы/проигрыши)
    3. Lead Guitar        — соло-гитара, основная мелодия
    4. Bass               — бас-гитара
    5. Drums (канал 10)   — лёгкая ударка (можно удалить)

Структура повторяет текст: Интро(8) -> Куплет 1-2 -> Проигрыш -> Припев(8)
-> Проигрыш -> Куплет 3-4 -> Припев -> Бридж -> Проигрыш -> Куплет 5-6
-> Припев -> Финальный проигрыш с затуханием.
"""

import random
import struct
import sys

# ---------------------------------------------------------------- настройки

TEMPO_BPM = 92          # спокойный, чуть тягучий темп под этот текст
TPQ = 480               # тиков на четверть
BEAT = TPQ
BAR = 4 * TPQ           # размер 4/4
OUT_FILE = "ya_ved_ne_svyat.mid"

PROGRESSION = ["Em", "C", "G", "D"]   # один аккорд на такт

# Ноты (MIDI): E2=40, C3=48, G2=43, D3=50 и т.д.
CHORDS = {
    #        полный аккорд (для боя)         перебор (бас->верх)   пауэр-аккорд    бас
    "Em": dict(strum=[40, 47, 52, 55, 59, 64], pick=[40, 55, 59, 64], power=[40, 47, 52], bass=28),
    "C":  dict(strum=[48, 52, 55, 60, 64],     pick=[48, 55, 60, 64], power=[48, 55, 60], bass=36),
    "G":  dict(strum=[43, 47, 50, 55, 59, 67], pick=[43, 50, 55, 62], power=[43, 50, 55], bass=31),
    "D":  dict(strum=[50, 57, 62, 66],         pick=[50, 57, 62, 66], power=[50, 57, 62], bass=38),
}

# Перебор: индексы в списке pick (бас, средняя, средняя, верхняя) по восьмым
PICK_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2]

# Бой ритм-гитары: (доля, длительность в долях, направление D/U)
STRUM_PATTERN = [(0, 1.4, "D"), (1.5, 0.9, "D"), (2.5, 0.45, "U"),
                 (3, 0.45, "D"), (3.5, 0.45, "U")]

# ------------------------------------------------------------------ мелодии
# Каждая мелодия — список тактов; такт — список (доля, длительность, нота).

MELODIES = {
    # Куплет: спокойная вокальная линия вокруг E4-B4
    "verse": [
        [(0, 1, 64), (1, .5, 67), (1.5, .5, 66), (2, 2, 64)],   # Em
        [(0, 1, 67), (1, .5, 69), (1.5, .5, 67), (2, 2, 64)],   # C
        [(0, 1, 71), (1, .5, 69), (1.5, .5, 67), (2, 2, 62)],   # G
        [(0, 1, 66), (1, .5, 64), (1.5, .5, 66), (2, 2, 69)],   # D
    ],
    # Припев: выше и напористее (8 тактов, вторая половина с вариацией)
    "chorus": [
        [(0, 1.5, 76), (1.5, .5, 74), (2, 1, 71), (3, 1, 67)],  # Em
        [(0, 1, 72), (1, .5, 71), (1.5, .5, 72), (2, 2, 76)],   # C
        [(0, 1, 74), (1, .5, 71), (1.5, .5, 67), (2, 2, 71)],   # G
        [(0, 1, 69), (1, .5, 66), (1.5, .5, 69), (2, 2, 74)],   # D
        [(0, 1.5, 76), (1.5, .5, 74), (2, 1, 71), (3, 1, 67)],  # Em
        [(0, 1, 72), (1, .5, 71), (1.5, .5, 72), (2, 2, 76)],   # C
        [(0, 1, 74), (1, .5, 71), (1.5, .5, 67), (2, 2, 71)],   # G
        [(0, 1, 69), (1, .5, 71), (1.5, .5, 74), (2, 2, 76)],   # D -> в тонику
    ],
    # Интро: первые 4 такта только перебор, потом тихий мотив
    "intro": [
        [], [], [], [],
        [(0, 2, 71), (2, 2, 67)],                               # Em
        [(0, 2, 72), (2, 2, 67)],                               # C
        [(0, 2, 71), (2, 2, 62)],                               # G
        [(0, 2, 69), (2, 1, 66), (3, 1, 64)],                   # D
    ],
    # Бридж: мягкая восходящая линия
    "bridge": [
        [(0, .5, 64), (.5, .5, 67), (1, 1, 71), (2, 2, 67)],    # Em
        [(0, .5, 64), (.5, .5, 67), (1, 1, 72), (2, 2, 71)],    # C
        [(0, .5, 62), (.5, .5, 67), (1, 1, 71), (2, 2, 74)],    # G
        [(0, .5, 66), (.5, .5, 69), (1, 1, 74), (2, 2, 76)],    # D
    ],
}

# Проигрыш: гитарный рифф восьмыми (арпеджио вверх-вниз по аккорду)
RIFF = {
    "Em": [64, 67, 71, 76, 74, 71, 67, 71],
    "C":  [60, 64, 67, 72, 76, 72, 67, 64],
    "G":  [67, 71, 74, 79, 74, 71, 67, 64],
    "D":  [66, 69, 74, 78, 74, 69, 66, 69],
}

# --------------------------------------------------------- структура песни
# (название, количество кругов Em|C|G|D, параметры слоёв)

SECTIONS = [
    ("Интро (перебор)", 2, dict(pick=True, lead="intro", bass="soft", vel=0.85)),
    ("Куплет 1",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.9)),
    ("Куплет 2",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.95)),
    ("Проигрыш",        1, dict(pick=True, strum=True, lead="riff", bass="drive", drums="full", vel=1.0)),
    ("Припев",          2, dict(pick=True, strum=True, lead="chorus", bass="drive", drums="full", crash=True, vel=1.0)),
    ("Проигрыш",        1, dict(pick=True, strum=True, lead="riff", bass="drive", drums="full", vel=1.0)),
    ("Куплет 3",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.9)),
    ("Куплет 4",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.95)),
    ("Припев",          2, dict(pick=True, strum=True, lead="chorus", bass="drive", drums="full", crash=True, vel=1.0)),
    ("Бридж",           1, dict(pick=True, lead="bridge", bass="soft", drums="light", vel=0.8)),
    ("Проигрыш",        1, dict(pick=True, strum=True, lead="riff", bass="drive", drums="full", vel=1.0)),
    ("Куплет 5",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.9)),
    ("Куплет 6",        1, dict(pick=True, lead="verse", bass="drive", drums="light", vel=0.95)),
    ("Припев",          2, dict(pick=True, strum=True, lead="chorus", bass="drive", drums="full", crash=True, vel=1.0)),
    ("Финальный проигрыш (затухание)", 2,
     dict(pick=True, strum=True, lead="riff", bass="drive", drums="full", fade=True, vel=1.0)),
]

# --------------------------------------------------- низкоуровневый SMF-код

def vlq(value):
    """Variable-length quantity — формат длительностей в MIDI-файле."""
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


class Track:
    """Одна MIDI-дорожка: копим события (тик, приоритет, байты), потом пишем."""

    def __init__(self, name, channel, program=None, pan=None, volume=None):
        self.events = []
        self.channel = channel
        self._meta(0, 0x03, name.encode("utf-8"))
        if program is not None:
            self.events.append((0, 0, bytes([0xC0 | channel, program])))
        if volume is not None:
            self.events.append((0, 0, bytes([0xB0 | channel, 7, volume])))
        if pan is not None:
            self.events.append((0, 0, bytes([0xB0 | channel, 10, pan])))

    def _meta(self, tick, kind, data):
        self.events.append((tick, 0, bytes([0xFF, kind]) + vlq(len(data)) + data))

    def marker(self, tick, text):
        self._meta(tick, 0x06, text.encode("utf-8"))

    def tempo(self, tick, bpm):
        self._meta(tick, 0x51, struct.pack(">I", round(60_000_000 / bpm))[1:])

    def time_signature(self, tick):
        self._meta(tick, 0x58, bytes([4, 2, 24, 8]))

    def note(self, tick, dur, pitch, vel):
        vel = max(1, min(127, round(vel)))
        tick, dur = round(tick), max(1, round(dur))
        self.events.append((tick, 2, bytes([0x90 | self.channel, pitch, vel])))
        self.events.append((tick + dur, 1, bytes([0x80 | self.channel, pitch, 0])))

    def to_bytes(self):
        data = b""
        last = 0
        # note-off (приоритет 1) раньше note-on (2) на одном тике,
        # чтобы повторная нота не обрывалась
        for tick, _prio, msg in sorted(self.events, key=lambda e: (e[0], e[1])):
            data += vlq(tick - last) + msg
            last = tick
        data += vlq(BAR) + b"\xff\x2f\x00"   # end of track через такт тишины
        return b"MTrk" + struct.pack(">I", len(data)) + data


def write_midi(path, tracks):
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), TPQ))
        for t in tracks:
            f.write(t.to_bytes())

# ----------------------------------------------------------- слои-паттерны

rng = random.Random(2026)   # фиксированное зерно — файл всегда одинаковый

def hum(vel, spread=6):
    """Лёгкая «человечность»: случайный разброс громкости."""
    return vel + rng.randint(-spread, spread)


def add_pick(track, bar_tick, chord, vel):
    """Перебор восьмыми (как в интро «перебор, 8 тактов»)."""
    notes = CHORDS[chord]["pick"]
    for i, idx in enumerate(PICK_PATTERN):
        v = vel + (8 if idx == 0 else 0)          # бас чуть громче
        track.note(bar_tick + i * BEAT // 2, int(BEAT * 0.9), notes[idx], hum(v))


def add_strum(track, bar_tick, chord, vel):
    """Бой пауэр-аккордами для припевов и проигрышей."""
    notes = CHORDS[chord]["power"]
    for beat, dur, direction in STRUM_PATTERN:
        order = notes if direction == "D" else list(reversed(notes))
        v = vel if direction == "D" else vel - 14
        for j, pitch in enumerate(order):
            track.note(bar_tick + beat * BEAT + j * 12,      # 12 тиков — «мазок» боя
                       dur * BEAT - j * 12, pitch, hum(v))


def add_lead_melody(track, bar_tick, bar_notes, vel):
    for beat, dur, pitch in bar_notes:
        track.note(bar_tick + beat * BEAT, dur * BEAT * 0.95, pitch, hum(vel))


def add_lead_riff(track, bar_tick, chord, vel):
    for i, pitch in enumerate(RIFF[chord]):
        track.note(bar_tick + i * BEAT // 2, int(BEAT * 0.45), pitch, hum(vel))


def add_bass(track, bar_tick, chord, style, vel):
    root = CHORDS[chord]["bass"]
    if style == "soft":
        track.note(bar_tick, BAR * 0.95, root, hum(vel))
    else:  # drive
        track.note(bar_tick, 1.5 * BEAT, root, hum(vel + 6))
        track.note(bar_tick + 1.5 * BEAT, 0.5 * BEAT, root, hum(vel - 8))
        track.note(bar_tick + 2 * BEAT, BEAT, root, hum(vel))
        track.note(bar_tick + 3 * BEAT, BEAT, root + 7, hum(vel - 4))


KICK, SNARE, STICK, HAT, CRASH = 36, 38, 37, 42, 49

def add_drums(track, bar_tick, style, vel, crash=False):
    if crash:
        track.note(bar_tick, BEAT, CRASH, hum(vel))
    for i in range(8):                                   # хай-хэт восьмыми
        track.note(bar_tick + i * BEAT // 2, BEAT // 2,
                   HAT, hum(vel - (30 if i % 2 else 18)))
    if style == "light":
        track.note(bar_tick, BEAT, KICK, hum(vel - 12))
        track.note(bar_tick + 2 * BEAT, BEAT, KICK, hum(vel - 16))
        track.note(bar_tick + BEAT, BEAT, STICK, hum(vel - 18))
        track.note(bar_tick + 3 * BEAT, BEAT, STICK, hum(vel - 18))
    else:  # full
        track.note(bar_tick, BEAT, KICK, hum(vel))
        track.note(bar_tick + 2 * BEAT, BEAT, KICK, hum(vel - 4))
        track.note(bar_tick + 2.5 * BEAT, BEAT / 2, KICK, hum(vel - 14))
        track.note(bar_tick + BEAT, BEAT, SNARE, hum(vel))
        track.note(bar_tick + 3 * BEAT, BEAT, SNARE, hum(vel))

# --------------------------------------------------------------- сборка

def build_song(with_drums=True):
    conductor = Track("Я ведь не свят — Em C G D", 0)
    conductor.tempo(0, TEMPO_BPM)
    conductor.time_signature(0)

    pick = Track("Fingerpick Guitar", 0, program=25, pan=40, volume=95)   # сталь. акустика
    rhythm = Track("Rhythm Guitar", 1, program=29, pan=88, volume=100)    # overdriven
    lead = Track("Lead Guitar", 2, program=27, pan=64, volume=110)        # clean electric
    bass = Track("Bass", 3, program=33, pan=64, volume=105)               # finger bass
    drums = Track("Drums", 9, pan=64, volume=90)

    tick = 0
    for name, rounds, cfg in SECTIONS:
        conductor.marker(tick, name)
        n_bars = rounds * 4
        base_vel = cfg.get("vel", 1.0)
        melody = MELODIES.get(cfg.get("lead")) if cfg.get("lead") in MELODIES else None

        for bar in range(n_bars):
            chord = PROGRESSION[bar % 4]
            bar_tick = tick + bar * BAR

            fade = 1.0
            if cfg.get("fade"):                      # затухание в финале
                fade = 1.0 - 0.75 * bar / max(1, n_bars - 1)
            v = base_vel * fade

            if cfg.get("pick"):
                add_pick(pick, bar_tick, chord, 72 * v)
            if cfg.get("strum"):
                add_strum(rhythm, bar_tick, chord, 96 * v)

            if cfg.get("lead") == "riff":
                add_lead_riff(lead, bar_tick, chord, 92 * v)
            elif melody:
                add_lead_melody(lead, bar_tick, melody[bar % len(melody)], 98 * v)

            if cfg.get("bass"):
                add_bass(bass, bar_tick, chord, cfg["bass"], 88 * v)

            if with_drums and cfg.get("drums"):
                add_drums(drums, bar_tick, cfg["drums"], 92 * v,
                          crash=cfg.get("crash", False) and bar == 0)

        tick += n_bars * BAR

    tracks = [conductor, pick, rhythm, lead, bass]
    if with_drums:
        tracks.append(drums)
    return tracks, tick


def main():
    with_drums = "--no-drums" not in sys.argv
    tracks, total_ticks = build_song(with_drums)
    write_midi(OUT_FILE, tracks)

    total_bars = total_ticks // BAR
    seconds = total_ticks / TPQ * 60 / TEMPO_BPM
    print(f"Готово: {OUT_FILE}")
    print(f"Темп: {TEMPO_BPM} BPM, тактов: {total_bars}, "
          f"длительность ~{int(seconds // 60)}:{int(seconds % 60):02d}")
    print("Дорожки: перебор, ритм-гитара, соло-гитара, бас"
          + (", барабаны" if with_drums else ""))
    print("Перетащи файл в FL Studio (File -> Import -> MIDI file).")


if __name__ == "__main__":
    main()
