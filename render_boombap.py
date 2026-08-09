#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Рендер хип-хоп бита из generate_boombap.py в звук (MP3/WAV).

Это не замена FL Studio — простой синтезатор, чтобы услышать идею до
того, как открывать проект и грузить сэмплы.

    python3 render_boombap.py                  # beat.mp3, весь бит
    python3 render_boombap.py --seconds 40     # быстрое превью
    python3 render_boombap.py --no-vinyl       # без винила и шума ленты

Пиано синтезируется аддитивно: набор обертонов с негармоничностью
(струна жёсткая, поэтому обертоны уходят выше кратных частот) и разной
скоростью затухания у каждого. Без этого рояль звучит как орган.
"""

import argparse

import numpy as np

import dsp
import generate_boombap as G
from dsp import SR

# ---------------------------------------------------------------- инструменты


def render_piano(pitch, dur, rng):
    """Рояль: обертоны с негармоничностью + шум молоточка."""
    f0 = 440.0 * 2 ** ((pitch - 69) / 12)

    # низкие ноты звучат дольше — как на настоящем рояле с педалью
    decay = float(np.clip(2.4 + (60 - pitch) / 12 * 1.15, 0.55, 5.0))
    n = int((min(dur + decay * 0.8, decay) + 0.15) * SR)
    t = np.arange(n) / SR

    # B — коэффициент жёсткости струны: чем выше, тем сильнее «расстроены»
    # верхние обертоны относительно кратных частот
    B = 0.0004 + max(0, (pitch - 60)) * 2.2e-5
    n_max = min(22, max(4, int(SR * 0.45 / f0)))

    sig = np.zeros(n)
    for k in range(1, n_max + 1):
        fk = f0 * k * np.sqrt(1.0 + B * k * k)
        if fk > SR * 0.47:
            break
        amp = (1.0 / k ** 1.25) * (0.75 + 0.5 * rng.random())
        tau = decay / (1.0 + 0.38 * (k - 1) ** 0.9)
        env = np.exp(-t / tau)
        # две слегка расстроенные струны на голос -> лёгкие биения
        det = 1.0 + (0.0006 if k <= 6 else 0.0)
        sig += amp * env * (np.sin(2 * np.pi * fk * t + rng.random() * 6.28)
                            + np.sin(2 * np.pi * fk * det * t) * 0.6)

    # удар молоточка: короткий призвук в атаке
    hn = int(0.010 * SR)
    hammer = dsp.lp(dsp.noise(hn, rng), 4500) * np.exp(-np.arange(hn) / SR / 0.0035)
    sig[:hn] += hammer * 0.22 * (1.0 + (60 - pitch) / 60)

    sig *= dsp.adsr(n, a=0.002, d=0.02, s=1.0, r=0.06)
    sig /= max(np.abs(sig).max(), 1e-9)
    sig *= 0.55
    # высокие ноты чуть правее — как раскладка струн под крышкой
    pan = 0.5 + np.clip((pitch - 60) / 60, -0.32, 0.32)
    return np.stack([sig * np.sqrt(1 - pan), sig * np.sqrt(pan)])


def render_chop(pitch, dur, rng):
    """Соул-чоп: пила через формантные полосы — тёплый гласный звук."""
    f0 = 440.0 * 2 ** ((pitch - 69) / 12)
    n = int((dur + 0.45) * SR)
    t = np.arange(n) / SR

    vib = 1.0 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.35, 0, 1)
    raw = dsp.saw(f0 * vib, n) * 0.7 + dsp.saw(f0 * vib * 1.004, n, phase=0.3) * 0.3

    # форманты между «о» и «а» — на них держится ощущение голоса
    voiced = (dsp.bp(raw, 380, 620) * 1.0
              + dsp.bp(raw, 800, 1150) * 0.65
              + dsp.bp(raw, 2200, 2900) * 0.22)
    voiced = dsp.lp(voiced, 4200)                 # тепло, без «стекла»

    env = dsp.adsr(n, a=0.09, d=0.25, s=0.62, r=0.38)
    m = voiced * env
    m /= max(np.abs(m).max(), 1e-9)
    m *= 0.5
    return np.stack([m * 0.92, m * 1.08])


def render_808(pitch, dur, rng):
    """808: синус с подъездом по высоте в атаке и долгим затуханием."""
    f0 = 440.0 * 2 ** ((pitch - 69) / 12)
    n = int((dur + 0.35) * SR)
    t = np.arange(n) / SR
    # короткий спад высоты в начале даёт «тук» перед нотой
    f = f0 * (1.0 + 0.55 * np.exp(-t / 0.018))
    m = np.sin(2 * np.pi * np.cumsum(f) / SR)
    m *= np.exp(-t / max(dur * 0.55, 0.35))
    m = np.tanh(m * 1.9) * 0.82                    # сатурация: слышно на телефоне
    m *= dsp.adsr(n, a=0.004, d=0.05, s=0.95, r=0.12)
    return np.stack([m, m])


def render_drum(pitch, rng):
    """Boom bap: бочка короткая и плотная, малый резкий."""
    if pitch == G.KICK:
        n = int(0.30 * SR)
        t = np.arange(n) / SR
        f = 48 + 62 * np.exp(-t / 0.014)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.085)
        click = dsp.hp(dsp.noise(n, rng), 1800) * np.exp(-t / 0.0035) * 0.30
        m = np.tanh((body + click) * 1.6) * 0.92
        return np.stack([m, m])

    if pitch in (G.SNARE, G.RIM):
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        body = (np.sin(2 * np.pi * 195 * t) * 0.5
                + np.sin(2 * np.pi * 331 * t) * 0.3) * np.exp(-t / 0.035)
        snap = dsp.bp(dsp.noise(n, rng), 900, 8500) * np.exp(-t / 0.055)
        crack = dsp.hp(dsp.noise(n, rng), 4500) * np.exp(-t / 0.008) * 0.26
        m = np.tanh((body * 0.8 + snap * 0.9 + crack) * 1.3) * 0.62
        if pitch == G.RIM:
            m *= 0.5
        return np.stack([m * 1.02, m * 0.98])

    if pitch == G.CLAP:
        # клэп: несколько коротких всплесков подряд, без тонального тела
        n = int(0.20 * SR)
        t = np.arange(n) / SR
        m = np.zeros(n)
        for k, off in enumerate((0.0, 0.007, 0.014)):
            i = int(off * SR)
            m[i:] += (dsp.noise(n - i, rng)
                      * np.exp(-np.arange(n - i) / SR / 0.010) * 0.85 ** k)
        m += dsp.noise(n, rng) * np.exp(-t / 0.055) * 0.35
        m = dsp.bp(m, 1100, 6500) * 0.42
        return np.stack([m * 1.06, m * 0.94])

    if pitch in (G.HAT, G.OPENHAT):
        dec = 0.026 if pitch == G.HAT else 0.16
        n = int((dec * 5 + 0.02) * SR)
        t = np.arange(n) / SR
        # амплитуда ниже, чем кажется: хэты приходят с высокой velocity,
        # громкость набирается уже на ней
        m = dsp.hp(dsp.noise(n, rng), 7600) * np.exp(-t / dec) * 0.135
        return np.stack([m * 0.88, m * 1.12])

    n = int(1.2 * SR)
    t = np.arange(n) / SR
    m = dsp.hp(dsp.noise(n, rng), 5000) * np.exp(-t / 0.45) * 0.22
    return np.stack([m, m])


# ------------------------------------------------------------- атмосфера

def vinyl_crackle(n, rng):
    """Треск винила: редкие щелчки со случайной амплитудой + шум дорожки."""
    out = np.zeros(n)
    n_clicks = int(n / SR * 60)
    pos = rng.integers(0, max(1, n - 8), n_clicks)
    # тяжёлый хвост распределения: в основном мелочь, изредка громкий щелчок
    amp = np.clip(rng.pareto(1.6, n_clicks), 0, 14) * 0.05
    for p, a in zip(pos, amp):
        out[p] += a * (1 if rng.random() > 0.5 else -1)
        out[p + 1] -= a * 0.55
    out = dsp.bp(out, 1200, 7000)

    surface = dsp.bp(dsp.noise(n, rng), 300, 4500) * 0.012
    both = out + surface
    # два слегка разных канала — шум не должен быть точкой в центре
    return np.stack([both, np.roll(both, 137) * 0.95])


def tape_hiss(n, rng):
    h = dsp.hp(dsp.noise(n, rng), 1600) * 0.006
    return np.stack([h, np.roll(h, 61)])


def wow_flutter(bus, rng, rate=0.55, depth=0.0011):
    """Плавание высоты, как у ленты и винила: чуть-чуть, но узнаваемо."""
    n = bus.shape[1]
    t = np.arange(n) / SR
    mod = (depth * np.sin(2 * np.pi * rate * t)
           + depth * 0.35 * np.sin(2 * np.pi * rate * 3.9 * t + 1.1))
    idx = np.clip(np.arange(n) + mod * SR, 0, n - 1)
    base = np.arange(n)
    return np.stack([np.interp(idx, base, bus[c]) for c in range(2)])


# -------------------------------------------------------------------- микс

# роль -> (громкость, реверб wet, decay, damp)
MIX = {
    "piano":  (0.70, 0.22, 1.7, 5500),
    "melody": (0.58, 0.26, 2.0, 6000),
    "chop":   (0.30, 0.38, 2.4, 4500),
    "sub":    (0.85, 0.00, 0.0, 0),
    "drums":  (0.78, 0.07, 0.7, 7000),
}


def render(parts, bpm, seconds=None, vinyl=True):
    spb = 60.0 / bpm
    total = max(p.length_beats for p in parts)
    n = int((total * spb + 4.0) * SR)
    if seconds:
        n = min(n, int(seconds * SR))

    rng = np.random.default_rng(1204)
    buses = {role: np.zeros((2, n)) for role in MIX}
    cache = {}
    kick_times = []

    for part in parts:
        bus = buses[part.role]
        for start, dur, pitch, vel in part.notes:
            i = int(start * spb * SR)
            if i >= n:
                continue
            if part.role == "drums":
                if pitch == G.KICK:
                    kick_times.append(start * spb)
                key = ("d", pitch)
                if key not in cache:
                    cache[key] = render_drum(pitch, rng)
            else:
                key = (part.role, pitch, round(dur * spb, 2))
                if key not in cache:
                    d = dur * spb
                    if part.role in ("piano", "melody"):
                        cache[key] = render_piano(pitch, d, rng)
                    elif part.role == "chop":
                        cache[key] = render_chop(pitch, d, rng)
                    else:
                        cache[key] = render_808(pitch, d, rng)
            sig = cache[key]
            k = min(sig.shape[1], n - i)
            bus[:, i:i + k] += sig[:, :k] * (vel / 127.0) ** 1.25

    print("  синтез готов, обрабатываю шины...")
    mix = np.zeros((2, n))
    for role, bus in buses.items():
        if not np.any(bus):
            continue
        gain, wet, dec, damp = MIX[role]
        if role == "sub":
            bus = np.stack([dsp.lp(c, 110) for c in bus])
            # мягко убираем 808 из-под бочки, чтобы низ не дрался
            bus = dsp.ducker(bus, kick_times, n, depth=0.35,
                             attack=0.004, release=0.10)
        if wet:
            bus = dsp.reverb(bus, amount=wet, decay=dec, damp=damp, rng=rng)
        mix += bus * gain

    if vinyl:
        print("  винил и лента...")
        mix = wow_flutter(mix, rng)
        mix += vinyl_crackle(n, rng) * 0.30
        mix += tape_hiss(n, rng)

    print("  мастеринг...")
    mix = np.stack([dsp.lp(c, 11000) for c in mix])   # заваленный верх ленты
    # хип-хоп не давят как EDM: ограничение мягче, динамика остаётся
    return dsp.master(mix, drive=1.25, ceiling=0.90)


def main():
    ap = argparse.ArgumentParser(description="Рендер хип-хоп бита в звук")
    ap.add_argument("--bpm", type=int, default=G.DEFAULT_BPM)
    ap.add_argument("--key", default=G.DEFAULT_KEY)
    ap.add_argument("--seconds", type=float, default=None)
    ap.add_argument("--no-vinyl", action="store_true")
    ap.add_argument("--out", default="beat.mp3")
    args = ap.parse_args()

    parts, _markers, bars = G.build_beat(args.bpm, args.key)
    print(f"Рендерю {args.key} {args.bpm} BPM, {bars} тактов...")
    audio = render(parts, args.bpm, args.seconds, vinyl=not args.no_vinyl)
    out = dsp.write_audio(args.out, audio)
    d = audio.shape[1] / SR
    print(f"Готово: {out} ({int(d//60)}:{int(d%60):02d})")


if __name__ == "__main__":
    main()
