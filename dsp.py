#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Общие кирпичи для софтверных синтезаторов: фильтры, огибающие,
осцилляторы, реверб, дилей и запись файлов.

Тут нет ничего жанрового — конкретные инструменты живут в рендерерах
(render_audio.py для EDM, render_boombap.py для хип-хопа).
"""

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, lfilter_zi

SR = 44100


# ------------------------------------------------------------------ фильтры

def lp(x, fc, order=2):
    b, a = butter(order, min(fc, SR * 0.49) / (SR / 2), "low")
    return lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = butter(order, max(fc, 10) / (SR / 2), "high")
    return lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [max(lo, 10) / (SR / 2),
                          min(hi, SR * 0.49) / (SR / 2)], "band")
    return lfilter(b, a, x)


def sweep_lowpass(bus, cutoff, blocksize=2048):
    """ФНЧ с плавно меняющейся частотой среза.

    Считаем блоками: коэффициенты пересчитываются на каждый блок, а
    состояние фильтра переносится — получается непрерывный свип.
    """
    bus = np.atleast_2d(bus)
    out = np.zeros_like(bus)
    for ch in range(bus.shape[0]):
        zi = None
        for i in range(0, bus.shape[1], blocksize):
            blk = bus[ch, i:i + blocksize]
            if not len(blk):
                break
            fc = float(np.clip(cutoff[min(i, len(cutoff) - 1)], 60, SR * 0.45))
            b, a = butter(2, fc / (SR / 2), "low")
            if zi is None:
                zi = lfilter_zi(b, a) * blk[0]
            y, zi = lfilter(b, a, blk, zi=zi)
            out[ch, i:i + blocksize] = y
    return out


# --------------------------------------------------------------- источники

def _poly_blep(t, dt):
    """Сглаживание скачка пилы — снимает большую часть алиасинга."""
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
    return 2.0 * ph - 1.0 - _poly_blep(ph, float(np.mean(freq)) / SR)


def noise(n, rng):
    return rng.standard_normal(n)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.08):
    """Огибающая громкости. Хвост release укладывается внутрь длины n."""
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
    if r_n and n > body:
        env[body:] = np.linspace(env[body - 1] if body else s, 0, n - body)
    return env


# ------------------------------------------------------------------ эффекты

def reverb(bus, amount=0.3, decay=1.1, damp=7000, predelay=0.012, rng=None):
    """Свёрточный реверб на затухающем шуме. damp — глухость хвоста."""
    rng = rng or np.random.default_rng(3)
    n_ir = int(decay * SR)
    t = np.arange(n_ir) / SR
    ir = rng.standard_normal((2, n_ir)) * np.exp(-t / (decay * 0.32))
    ir[:, :int(predelay * SR)] = 0
    ir = np.stack([lp(c, damp) for c in ir])
    ir /= np.abs(ir).max() * 28
    wet = np.stack([fftconvolve(bus[c], ir[c])[:bus.shape[1]] for c in range(2)])
    return bus * (1 - amount * 0.35) + wet * amount


def delay(bus, time_s, feedback=0.34, mix=0.26, taps=5):
    out = bus.copy()
    d = int(time_s * SR)
    if d <= 0:
        return out
    tap = bus.copy()
    for _ in range(taps):
        tap = np.pad(tap, ((0, 0), (d, 0)))[:, :bus.shape[1]] * feedback
        if np.abs(tap).max() < 1e-4:
            break
        out += tap * mix
    return out


def ducker(bus, times, n, depth=0.7, attack=0.006, release=0.30):
    """Сайдчейн: громкость ныряет в заданные моменты и плавно возвращается."""
    gain = np.ones(n)
    a_n, r_n = max(1, int(attack * SR)), max(1, int(release * SR))
    curve = np.concatenate([
        np.linspace(1.0, 1.0 - depth, a_n),
        1.0 - depth * (1.0 - np.linspace(0, 1, r_n) ** 0.55),
    ])
    for t in times:
        i = int(t * SR)
        seg = curve[:max(0, min(len(curve), n - i))]
        if len(seg):
            gain[i:i + len(seg)] = np.minimum(gain[i:i + len(seg)], seg)
    return bus * gain


def master(mix, drive=1.7, ceiling=0.89, fade=0.02):
    """Нормализация, мягкое ограничение и короткие фейды по краям."""
    mix = np.stack([hp(c, 26) for c in mix])
    peak = np.abs(mix).max()
    if peak > 0:
        mix = mix / peak
    mix = np.tanh(mix * drive) / np.tanh(drive)
    mix *= ceiling
    k = int(fade * SR)
    if k and mix.shape[1] > 2 * k:
        mix[:, :k] *= np.linspace(0, 1, k)
        mix[:, -k:] *= np.linspace(1, 0, k)
    return mix


# -------------------------------------------------------------------- вывод

def write_wav(path, audio):
    import wave
    data = (np.clip(audio.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())
    return path


def write_mp3(path, audio, bitrate=192):
    try:
        import lameenc
    except ImportError:
        alt = path.rsplit(".", 1)[0] + ".wav"
        print(f"  lameenc не установлен — пишу {alt}")
        return write_wav(alt, audio)
    enc = lameenc.Encoder()
    enc.set_bit_rate(bitrate)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    pcm = (np.clip(audio.T, -1, 1) * 32767).astype("<i2")
    with open(path, "wb") as f:
        f.write(bytes(enc.encode(pcm.tobytes()) + enc.flush()))
    return path


def write_audio(path, audio):
    return write_mp3(path, audio) if path.endswith(".mp3") else write_wav(path, audio)
