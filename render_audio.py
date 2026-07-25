#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Рендер аранжировки из generate_edm.py в слышимый звук (WAV/MP3).

Это НЕ замена FL Studio — здесь простой софтверный синтезатор, чтобы
можно было послушать идею до того, как открывать проект и ставить Serum.
Финальный звук всё равно делается плагинами в DAW.

    python3 render_audio.py                    # demo.mp3, весь трек
    python3 render_audio.py --seconds 45       # только первые 45 секунд
    python3 render_audio.py --out demo.wav     # без сжатия

Что синтезируется: супер-пила (7 расстроенных голосов) для аккордов и
лида, короткий пluck, синусовый суб-бас, барабаны из шума и синусов.
Плюс сайдчейн-пампинг от бочки, фильтровые свипы в билдах, дилей и реверб.
"""

import argparse

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, lfilter_zi

import generate_edm

SR = 44100

# ---------------------------------------------------------------- осцилляторы

def _poly_blep(t, dt):
    """Сглаживание скачка пилы — убирает большую часть алиасинга."""
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt
    out[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt
    out[m] = x * x + x + x + 1.0
    return out


def saw(freq, n, phase=0.0):
    """Пила с антиалиасингом. freq может быть массивом (для глайда)."""
    freq = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = (np.cumsum(freq) / SR + phase) % 1.0
    return 2.0 * ph - 1.0 - _poly_blep(ph, np.mean(freq) / SR)


def supersaw(freq, n, voices=7, detune=0.018, rng=None):
    """Расстроенный юнисон — основа звука future bass. Возвращает (2, n)."""
    rng = rng or np.random.default_rng(7)
    left = np.zeros(n)
    right = np.zeros(n)
    for i in range(voices):
        k = (i - (voices - 1) / 2) / max(1, (voices - 1) / 2)
        f = np.asarray(freq, dtype=float) * (1.0 + detune * k)
        v = saw(f, n, phase=rng.random())
        # крайние голоса разводим по сторонам — отсюда ширина супер-пилы
        pan = 0.5 + 0.5 * k
        left += v * np.sqrt(1 - pan)
        right += v * np.sqrt(pan)
    return np.stack([left, right]) / np.sqrt(voices)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.08):
    """Огибающая громкости. Хвост release дописывается к длине ноты."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    body = max(1, n - r_n)
    env = np.zeros(n)
    idx = 0
    if a_n:
        k = min(a_n, body)
        env[:k] = np.linspace(0, 1, k)
        idx = k
    if d_n and idx < body:
        k = min(d_n, body - idx)
        env[idx:idx + k] = np.linspace(1, s, k)
        idx += k
    if idx < body:
        env[idx:body] = s
    if r_n:
        tail = env[body - 1] if body else s
        env[body:] = np.linspace(tail, 0, n - body)
    return env


def noise(n, rng):
    return rng.standard_normal(n)


def _bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), min(hi, SR * 0.49) / (SR / 2)], "band")
    return lfilter(b, a, x)


def _hp(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), "high")
    return lfilter(b, a, x)


def _lp(x, fc, order=2):
    b, a = butter(order, min(fc, SR * 0.49) / (SR / 2), "low")
    return lfilter(b, a, x)


# ------------------------------------------------------------- инструменты

def render_note(role, pitch, dur, rng):
    """Один звук инструмента. Возвращает стерео-массив (2, n)."""
    freq = 440.0 * 2 ** ((pitch - 69) / 12)

    if role == "chords":
        n = int((dur + 0.35) * SR)
        f = np.full(n, freq)
        sig = supersaw(f, n, voices=7, detune=0.020, rng=rng)
        sig = np.stack([_lp(c, 6500) for c in sig])
        env = adsr(n, a=0.008, d=0.25, s=0.55, r=0.30)
        return sig * env

    if role == "lead":
        n = int((dur + 0.30) * SR)
        # короткий подъезд снизу — то самое портаменто из Serum
        glide = int(0.055 * SR)
        f = np.full(n, freq)
        f[:glide] = np.linspace(freq * 2 ** (-2 / 12), freq, glide)
        sig = supersaw(f, n, voices=7, detune=0.014, rng=rng)
        sig = np.stack([_lp(c, 9000) for c in sig])
        env = adsr(n, a=0.006, d=0.18, s=0.72, r=0.26)
        return sig * env

    if role == "pluck":
        n = int((dur + 0.25) * SR)
        sig = supersaw(np.full(n, freq), n, voices=3, detune=0.010, rng=rng)
        sig = np.stack([_lp(c, 5000) for c in sig])
        env = adsr(n, a=0.002, d=0.14, s=0.05, r=0.10)
        return sig * env

    if role == "chops":
        # грубая имитация вокал-чопа: пила + формантные полосы
        n = int((dur + 0.20) * SR)
        base = saw(np.full(n, freq), n)
        voiced = _bp(base, 500, 1100) * 1.0 + _bp(base, 1600, 2600) * 0.6
        env = adsr(n, a=0.010, d=0.12, s=0.45, r=0.18)
        m = voiced * env
        return np.stack([m, m])

    if role == "reese":
        # Мид-бас/гроул: расстроенные пилы -> биения между голосами, потом
        # воббл фильтром и дисторшн. Это и даёт клубный «рык».
        n = int((dur + 0.12) * SR)
        f = np.full(n, freq)
        raw = np.zeros(n)
        for k in (-1.0, -0.35, 0.35, 1.0):
            raw += saw(f * (1.0 + 0.011 * k), n, phase=rng.random())
        raw /= 2.0

        # воббл: LFO гоняет частоту среза, период привязан к длине ноты
        t = np.arange(n) / SR
        lfo_hz = max(4.0, min(14.0, 2.2 / max(dur, 0.08)))
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * lfo_hz * t - np.pi / 2)
        cutoff = 260 * (1 - lfo) + 2600 * lfo
        sig = sweep_lowpass(np.stack([raw, raw]), cutoff, blocksize=512)[0]

        sig = np.tanh(sig * 3.2) * 0.72        # дисторшн: добавляет гармоники
        sig = _hp(sig, 85)                     # снизу место для суба
        env = adsr(n, a=0.004, d=0.10, s=0.80, r=0.10)
        sig *= env
        # низ держим в моно, верх слегка разводим — как в клубном миксе
        low = _lp(sig, 240)
        high = sig - low
        return np.stack([low + high * 0.85, low + high * 1.15])

    if role == "sub":
        n = int((dur + 0.10) * SR)
        t = np.arange(n) / SR
        m = np.sin(2 * np.pi * freq * t)
        m = np.tanh(m * 1.5) * 0.8            # лёгкая сатурация — слышно на телефоне
        env = adsr(n, a=0.006, d=0.05, s=0.92, r=0.06)
        m *= env
        return np.stack([m, m])

    raise ValueError(role)


def render_drum(pitch, rng):
    """Барабаны синтезируем: бочка, клэп, снейр, хэты, крэш."""
    g = generate_edm

    if pitch == g.KICK:
        n = int(0.42 * SR)
        t = np.arange(n) / SR
        f = 48 + 115 * np.exp(-t / 0.022)      # питч-свип вниз = «щелчок» атаки
        body = np.sin(2 * np.pi * np.cumsum(f) / SR)
        body *= np.exp(-t / 0.13)
        click = _hp(noise(n, rng), 2500) * np.exp(-t / 0.004) * 0.35
        m = np.tanh((body + click) * 1.4) * 0.95
        return np.stack([m, m])

    if pitch in (g.CLAP, g.SNARE):
        n = int(0.34 * SR)
        t = np.arange(n) / SR
        m = np.zeros(n)
        for k, off in enumerate((0.0, 0.009, 0.018)):   # три хлопка подряд
            i = int(off * SR)
            seg = noise(n - i, rng) * np.exp(-np.arange(n - i) / SR / 0.012)
            m[i:] += seg * (0.9 ** k)
        m += noise(n, rng) * np.exp(-t / 0.10) * 0.5     # хвост
        m = _bp(m, 900, 6000)
        if pitch == g.SNARE:
            m += np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.06) * 0.35
        m *= 0.7
        return np.stack([m * 1.0, m * 0.95])

    if pitch in (g.HAT, g.OPENHAT):
        dec = 0.035 if pitch == g.HAT else 0.22
        n = int((dec * 4 + 0.02) * SR)
        t = np.arange(n) / SR
        m = _hp(noise(n, rng), 7000) * np.exp(-t / dec) * 0.32
        return np.stack([m * 0.85, m * 1.15])            # хэты чуть в стороны

    if pitch in (g.CRASH, g.RIDE):
        n = int(1.8 * SR)
        t = np.arange(n) / SR
        m = _hp(noise(n, rng), 4000) * np.exp(-t / 0.55) * 0.30
        return np.stack([m, m])

    n = int(0.12 * SR)
    m = _hp(noise(n, rng), 3000) * np.exp(-np.arange(n) / SR / 0.03) * 0.2
    return np.stack([m, m])


# ------------------------------------------------------------------ эффекты

def sweep_lowpass(bus, cutoff, blocksize=2048):
    """Фильтр с плавно меняющейся частотой среза (для интро и билдов)."""
    out = np.zeros_like(bus)
    for ch in range(bus.shape[0]):
        zi = None
        for i in range(0, bus.shape[1], blocksize):
            blk = bus[ch, i:i + blocksize]
            if not len(blk):
                break
            fc = float(np.clip(cutoff[min(i, len(cutoff) - 1)], 120, SR * 0.45))
            b, a = butter(2, fc / (SR / 2), "low")
            if zi is None:
                zi = lfilter_zi(b, a) * blk[0]
            y, zi = lfilter(b, a, blk, zi=zi)
            out[ch, i:i + blocksize] = y
    return out


def sidechain(bus, kick_times, n, depth=0.78, attack=0.006, release=0.30):
    """Пампинг: громкость ныряет на бочке и плавно возвращается."""
    gain = np.ones(n)
    a_n, r_n = int(attack * SR), int(release * SR)
    duck = np.concatenate([
        np.linspace(1.0, 1.0 - depth, max(1, a_n)),
        1.0 - depth * (1.0 - np.linspace(0, 1, max(1, r_n)) ** 0.55),
    ])
    for t in kick_times:
        i = int(t * SR)
        seg = duck[:max(0, min(len(duck), n - i))]
        if len(seg):
            gain[i:i + len(seg)] = np.minimum(gain[i:i + len(seg)], seg)
    return bus * gain


def reverb(bus, amount=0.3, decay=1.1, rng=None):
    rng = rng or np.random.default_rng(3)
    n_ir = int(decay * SR)
    t = np.arange(n_ir) / SR
    ir = rng.standard_normal((2, n_ir)) * np.exp(-t / (decay * 0.32))
    ir[:, :int(0.012 * SR)] = 0                     # предзадержка
    ir = np.stack([_lp(c, 7000) for c in ir])
    ir /= np.abs(ir).max() * 28
    wet = np.stack([fftconvolve(bus[c], ir[c])[:bus.shape[1]] for c in range(2)])
    return bus * (1 - amount * 0.35) + wet * amount


def delay(bus, time_s, feedback=0.34, mix=0.26):
    out = bus.copy()
    d = int(time_s * SR)
    if d <= 0:
        return out
    tap = bus.copy()
    for _ in range(5):
        tap = np.pad(tap, ((0, 0), (d, 0)))[:, :bus.shape[1]] * feedback
        if np.abs(tap).max() < 1e-4:
            break
        out += tap * mix
    return out


# -------------------------------------------------------------------- микс

# роль -> (громкость, реверб, дилей в долях такта)
MIX = {
    "chords": (0.52, 0.30, None),
    "lead":   (0.46, 0.26, 0.75),
    "pluck":  (0.26, 0.22, 0.375),
    "chops":  (0.22, 0.30, 0.75),
    "reese":  (0.62, 0.05, None),      # мид-бас громкий, но почти сухой
    "sub":    (0.80, 0.00, None),
    "drums":  (0.80, 0.06, None),
}
DUCKED = ("chords", "lead", "pluck", "chops", "reese", "sub")


def cutoff_curve(n, bpm):
    """Автоматизация фильтра по секциям: интро глухое, дроп открыт, билд едет вверх."""
    spb = 60.0 / bpm
    curve = np.full(n, 18000.0)
    beat = 0.0
    for name, bars, cfg in generate_edm.SECTIONS:
        i0 = int(beat * spb * SR)
        i1 = min(n, int((beat + bars * 4) * spb * SR))
        if i1 > i0:
            if cfg.get("build"):
                curve[i0:i1] = np.geomspace(900, 17000, i1 - i0)
            elif name in ("Intro", "Breakdown"):
                curve[i0:i1] = np.geomspace(1400, 9000, i1 - i0)
            elif name == "Outro":
                curve[i0:i1] = np.geomspace(9000, 700, i1 - i0)
        beat += bars * 4
    return curve


def render(parts, bpm, seconds=None):
    spb = 60.0 / bpm
    total_beats = max(p.length_beats for p in parts)
    n = int((total_beats * spb + 2.5) * SR)
    if seconds:
        n = min(n, int(seconds * SR))

    rng = np.random.default_rng(2026)
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
                if pitch == generate_edm.KICK:
                    kick_times.append(start * spb)
                key = ("d", pitch)
                if key not in cache:
                    cache[key] = render_drum(pitch, rng)
            else:
                key = (part.role, pitch, round(dur * spb, 3))
                if key not in cache:
                    cache[key] = render_note(part.role, pitch, dur * spb, rng)
            sig = cache[key]
            k = min(sig.shape[1], n - i)
            bus[:, i:i + k] += sig[:, :k] * (vel / 127.0) ** 1.3

    print("  синтез готов, обрабатываю шину...")
    curve = cutoff_curve(n, bpm)
    mix = np.zeros((2, n))

    for role, bus in buses.items():
        if not np.any(bus):
            continue
        gain, rev, dly = MIX[role]
        if role in ("chords", "pluck", "chops"):
            bus = sweep_lowpass(bus, curve)
        elif role == "lead":
            bus = sweep_lowpass(bus, np.maximum(curve, 3000))
        if role == "sub":
            bus = np.stack([_lp(c, 110) for c in bus])       # суб строго снизу
        if dly:
            bus = delay(bus, dly * spb)
        if role in DUCKED:
            # бас душим сильнее — иначе бочка в него утыкается
            depth = {"sub": 0.88, "reese": 0.80}.get(role, 0.72)
            bus = sidechain(bus, kick_times, n, depth=depth)
        if rev:
            bus = reverb(bus, amount=rev, rng=rng)
        mix += bus * gain

    print("  мастеринг...")
    mix = np.stack([_hp(c, 28) for c in mix])                # чистим инфраниз
    peak = np.abs(mix).max()
    if peak > 0:
        mix /= peak
    mix = np.tanh(mix * 1.7) / np.tanh(1.7)                  # мягкое ограничение
    mix *= 0.89
    fade = int(0.02 * SR)
    mix[:, :fade] *= np.linspace(0, 1, fade)
    mix[:, -fade:] *= np.linspace(1, 0, fade)
    return mix


# ------------------------------------------------------------------- вывод

def write_wav(path, audio):
    import wave
    data = (np.clip(audio.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())


def write_mp3(path, audio, bitrate=192):
    try:
        import lameenc
    except ImportError:
        alt = path.rsplit(".", 1)[0] + ".wav"
        print(f"  lameenc не установлен — пишу {alt}")
        write_wav(alt, audio)
        return alt
    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    pcm = (np.clip(audio.T, -1, 1) * 32767).astype("<i2")
    data = enc.encode(pcm.tobytes()) + enc.flush()
    with open(path, "wb") as f:
        f.write(bytes(data))
    return path


def main():
    ap = argparse.ArgumentParser(description="Рендер EDM-аранжировки в звук")
    ap.add_argument("--style", default="future", choices=sorted(generate_edm.STYLES))
    ap.add_argument("--bpm", type=int, default=None)
    ap.add_argument("--key", default=generate_edm.DEFAULT_KEY)
    ap.add_argument("--seconds", type=float, default=None, help="обрезать превью")
    ap.add_argument("--out", default="demo.mp3")
    args = ap.parse_args()

    parts, _markers, bars, bpm = generate_edm.build_song(args.bpm, args.key, args.style)
    print(f"Рендерю {args.style}: {args.key} {bpm} BPM, {bars} тактов...")
    audio = render(parts, bpm, args.seconds)
    if args.out.endswith(".mp3"):
        out = write_mp3(args.out, audio)
    else:
        write_wav(args.out, audio)
        out = args.out
    dur = audio.shape[1] / SR
    print(f"Готово: {out} ({int(dur//60)}:{int(dur%60):02d})")


if __name__ == "__main__":
    main()
