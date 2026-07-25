#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Минимальный писатель стандартных MIDI-файлов (SMF format 1).

Без зависимостей — чистый Python.

Модель простая: песня — это список Part, каждая Part хранит ноты в долях
(beats), а не в тиках. Такое представление одинаково удобно и для записи
MIDI (generate_edm.py), и для рендера в звук (render_audio.py).
"""

import struct

TPQ = 480                 # тиков на четвертную ноту
BEAT = TPQ
BAR = 4 * TPQ             # такт 4/4

DRUM_CHANNEL = 9          # десятый канал (нумерация с нуля) — барабаны


class Part:
    """Одна партия: имя, тембр, канал и список нот в долях.

    Нота — кортеж (start_beats, dur_beats, pitch, velocity).
    Держим доли, а не тики: рендер в звук работает во времени, и
    пересчитывать тики обратно было бы лишней работой.
    """

    def __init__(self, name, program=0, channel=0, pan=64, volume=100, role=""):
        self.name = name
        self.program = program
        self.channel = channel
        self.pan = pan
        self.volume = volume
        self.role = role or name       # роль для синтезатора при рендере
        self.notes = []
        self.bends = []                # (beat, value) value: -8192..8191

    def add(self, start, dur, pitch, vel=100):
        """Добавить ноту. Громкость зажимаем в допустимый MIDI-диапазон."""
        self.notes.append((float(start), float(dur), int(pitch),
                           max(1, min(127, int(round(vel))))))

    def bend(self, beat, value):
        """Питч-бенд: value от -8192 до 8191 (0 — без сдвига)."""
        self.bends.append((float(beat), max(-8192, min(8191, int(value)))))

    @property
    def length_beats(self):
        return max((s + d for s, d, _, _ in self.notes), default=0.0)


# ------------------------------------------------------------------- запись

def _vlq(value):
    """Variable-length quantity — так MIDI кодирует паузы между событиями."""
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(out))


def _meta(kind, data):
    return bytes([0xFF, kind]) + _vlq(len(data)) + data


def _track_bytes(events):
    """events: список (tick, priority, raw_bytes) -> готовый чанк MTrk."""
    data = b""
    last = 0
    # приоритет: мета(0) -> note-off(1) -> note-on(2). Note-off раньше
    # note-on на одном тике, иначе повтор той же ноты обрывает сам себя.
    for tick, _prio, msg in sorted(events, key=lambda e: (e[0], e[1])):
        data += _vlq(tick - last) + msg
        last = tick
    data += _vlq(BAR) + b"\xff\x2f\x00"        # end of track
    return b"MTrk" + struct.pack(">I", len(data)) + data


def _conductor(title, tempo_bpm, markers):
    """Служебная дорожка: название, темп, размер и маркеры секций."""
    ev = [(0, 0, _meta(0x03, title.encode("utf-8"))),
          (0, 0, _meta(0x51, struct.pack(">I", round(60_000_000 / tempo_bpm))[1:])),
          (0, 0, _meta(0x58, bytes([4, 2, 24, 8])))]
    for beat, text in markers:
        ev.append((round(beat * BEAT), 0, _meta(0x06, text.encode("utf-8"))))
    return _track_bytes(ev)


def _part_bytes(part):
    ch = part.channel
    ev = [(0, 0, _meta(0x03, part.name.encode("utf-8"))),
          (0, 0, bytes([0xB0 | ch, 7, max(0, min(127, part.volume))])),
          (0, 0, bytes([0xB0 | ch, 10, max(0, min(127, part.pan))]))]
    if ch != DRUM_CHANNEL:
        ev.append((0, 0, bytes([0xC0 | ch, part.program])))

    for beat, value in part.bends:
        v = value + 8192
        ev.append((round(beat * BEAT), 0,
                   bytes([0xE0 | ch, v & 0x7F, (v >> 7) & 0x7F])))

    for start, dur, pitch, vel in part.notes:
        t = round(start * BEAT)
        d = max(1, round(dur * BEAT))
        ev.append((t, 2, bytes([0x90 | ch, pitch, vel])))
        ev.append((t + d, 1, bytes([0x80 | ch, pitch, 0])))
    return _track_bytes(ev)


def write_midi(path, parts, tempo_bpm, title="Untitled", markers=()):
    """Собрать и записать SMF format 1: дирижёр + по дорожке на партию."""
    chunks = [_conductor(title, tempo_bpm, markers)]
    chunks += [_part_bytes(p) for p in parts if p.notes]
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), TPQ))
        for c in chunks:
            f.write(c)
    return path
