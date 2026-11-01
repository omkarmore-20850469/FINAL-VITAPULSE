#!/usr/bin/env python3
"""VitaPulse workout music generator  (v2: one playlist per workout).

Every sound is synthesised from scratch with numpy/scipy - no samples, no third-party
material - so the output is original, royalty-free work you may ship with the app.

What is "advanced" compared with v1:
  * stereo mixes with per-note panning, plate/hall reverb (convolution), ping-pong delay
  * real arrangements: intro > build > drop > breakdown > drop 2 > outro
  * voice-led chord voicings (7th / 9th / sus chords), generated hook melodies that repeat
    and answer themselves, sidechain "pumping", snare rolls, risers, impacts
  * instruments: FM electric piano, 808 sub, band-limited supersaw, pluck, bell, vinyl, ocean air
Every track starts exactly on beat 1 and is a whole number of bars, so the 3D trainer can lock
its stride to  audio.currentTime * bpm / 60.

Usage:  python3 tools/generate_tracks.py            # all tracks
        python3 tools/generate_tracks.py fire-lap   # just one track
Needs:  numpy, scipy, ffmpeg.   Output: vitapulse-angular20/src/assets/music/*.mp3
"""
import subprocess, wave, pathlib, sys, time
from functools import lru_cache
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
OUT = pathlib.Path(__file__).resolve().parent.parent / "vitapulse-angular20/src/assets/music"
OUT.mkdir(parents=True, exist_ok=True)
_rng = np.random.default_rng(11)

# --------------------------------------------------------------------------- basics
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def noise(n): return _rng.standard_normal(n)

_sos = {}
def _get(kind, fc, order):
    key = (kind, fc if np.isscalar(fc) else tuple(fc), order)
    if key not in _sos:
        _sos[key] = butter(order, np.asarray(fc, float) / (SR / 2), kind, output="sos")
    return _sos[key]
def lp(x, fc, order=2): return sosfilt(_get("low", float(fc), order), x, axis=-1)
def hp(x, fc, order=2): return sosfilt(_get("high", float(fc), order), x, axis=-1)
def bp(x, lo, hi, order=2): return sosfilt(_get("band", (float(lo), float(hi)), order), x, axis=-1)

def adsr(n, a=.005, d=.1, s=.0, r=.05):
    a_n = max(1, min(int(a * SR), n)); d_n = min(int(d * SR), n - a_n); r_n = min(int(r * SR), n)
    e = np.full(n, float(s)); e[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    if d_n > 0: e[a_n:a_n + d_n] = np.linspace(1, s, d_n)
    if r_n > 0: e[n - r_n:] *= np.linspace(1, 0, r_n)
    return e

def tail_fade(x, ms=10):
    k = min(len(x), int(ms / 1000 * SR))
    if k > 0: x[-k:] *= np.linspace(1, 0, k)
    return x

class Bus:
    """Stereo accumulation buffer; mono voices are placed with equal-power panning."""
    def __init__(s, n): s.x = np.zeros((2, n), np.float32)
    def add(s, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i < 0 or i >= s.x.shape[1] or len(sig) == 0: return
        j = min(i + len(sig), s.x.shape[1]); seg = sig[: j - i] * gain
        a = (pan + 1) * np.pi / 4
        s.x[0, i:j] += seg * np.cos(a); s.x[1, i:j] += seg * np.sin(a)
    def add_st(s, sig, t, gain=1.0):
        i = int(round(t * SR))
        if i < 0 or i >= s.x.shape[1]: return
        j = min(i + sig.shape[1], s.x.shape[1]); s.x[:, i:j] += sig[:, : j - i] * gain

# --------------------------------------------------------------------------- effects
@lru_cache(None)
def impulse(sec, seed, damp=5000.0):
    r = np.random.default_rng(seed); n = int(sec * SR); t = np.arange(n) / SR
    ir = r.standard_normal((2, n)) * np.exp(-t * (6.9 / sec))
    ir = lp(ir, damp) + 0.35 * hp(ir, damp) * np.exp(-t * 12)   # bright early reflections fade fast
    ir[:, : int(0.012 * SR)] *= 0.0
    ir *= np.minimum(1, t / 0.03)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))

def reverb(x, sec=2.2, seed=1, damp=5000.0):
    ir = impulse(sec, seed, damp)
    return np.stack([fftconvolve(x[c].astype(np.float64), ir[c])[: x.shape[1]] for c in (0, 1)]) * 0.5

def pingpong(x, delay_s, fb=0.45, taps=7, tone=4200.0):
    d = int(delay_s * SR); y = np.zeros(x.shape, np.float64)
    for k in range(1, taps + 1):
        sh = k * d
        if sh >= x.shape[1]: break
        g = fb ** k; a, b = (1, 0) if k % 2 else (0, 1)
        y[0, sh:] += x[a, : x.shape[1] - sh] * g; y[1, sh:] += x[b, : x.shape[1] - sh] * g
    return lp(y, tone)

def pump(n, beat, bar, names, active, amt, rel=0.62):
    """Sidechain-style gain curve: ducks on every beat, only in the sections listed in `active`."""
    t = np.arange(n) / SR; tm = t % beat; ph = tm / beat
    dip = amt * np.clip(1 - ph / rel, 0, 1) ** 1.6 * (1 - np.exp(-tm * 900))
    flag = np.array([1.0 if nm in active else 0.0 for nm in names])
    return 1 - dip * flag[np.minimum((t // bar).astype(int), len(names) - 1)]

# --------------------------------------------------------------------------- instruments
def saw_add(f, n, detunes=(0.0,), cutoff=3000.0, maxh=24, seed=0):
    """Band-limited saw by additive synthesis with a built-in low-pass roll-off (no aliasing)."""
    r = np.random.default_rng(seed); t = np.arange(n) / SR; out = np.zeros(n)
    kmax = int(min(maxh, SR * 0.45 / (f * (1 + max(detunes)))))
    for d in detunes:
        fd = f * (1 + d); ph0 = r.random() * 2 * np.pi
        for k in range(1, kmax + 1):
            out += (1.0 / k) / (1 + (k * fd / cutoff) ** 2) * np.sin(2 * np.pi * fd * k * t + ph0 * k)
    return out * (2 / np.pi) / len(detunes)

@lru_cache(None)
def kick(dur=.3, f0=150.0, f1=46.0, sweep=34.0, decay=8.0, drive=1.6, click=.3):
    n = int(dur * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t * sweep)) / SR) * np.exp(-t * decay)
    clk = hp(noise(n), 1800) * np.exp(-t * 350) * click
    return tail_fade(np.tanh((body + clk) * drive) / np.tanh(drive))

@lru_cache(None)
def snare(dur=.28, tone=190.0, body=.5, amt=.8, decay=16.0, tight=1500.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = hp(noise(n), tight) * np.exp(-t * decay) * amt + np.sin(2 * np.pi * tone * t * (1 + .25 * np.exp(-t * 35))) * np.exp(-t * 28) * body
    return tail_fade(x) * 0.9

@lru_cache(None)
def clap(dur=.32, decay=13.0):
    n = int(dur * SR); t = np.arange(n) / SR; nz = bp(noise(n), 900, 4200); x = np.zeros(n)
    for off in (0, .011, .022):
        i = int(off * SR); m = int(.03 * SR); x[i:i + m] += nz[i:i + m] * np.exp(-np.arange(m) / SR * 160) * .7
    j = int(.034 * SR); x[j:] += nz[j:] * np.exp(-t[: n - j] * decay)
    return tail_fade(x) * 0.8

@lru_cache(None)
def hat(kind="c"):
    dur, dec = {"c": (.07, 85.0), "o": (.38, 10.0), "t": (.035, 150.0)}[kind]
    n = int(dur * SR); t = np.arange(n) / SR
    return tail_fade(hp(noise(n), 7500) * np.exp(-t * dec) * 0.6, 4)

@lru_cache(None)
def shaker(dur=.09):
    n = int(dur * SR); t = np.arange(n) / SR
    return tail_fade(bp(noise(n), 5000, 11000) * np.minimum(1, t / .012) * np.exp(-t * 38) * .7, 6)

@lru_cache(None)
def sub808(midi, dur, drive=1.8, glide=.05):
    n = int(dur * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(hz(midi) * (1 + .9 * np.exp(-t / glide))) / SR
    x = np.tanh(np.sin(ph) * np.exp(-t * 2.2 / max(dur, .2)) * np.minimum(1, t * 400) * drive) / np.tanh(drive)
    return tail_fade(x, 25)

@lru_cache(None)
def sine_tone(midi, dur, att=1.5, rel=2.0):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz(midi) * t) * adsr(n, att, 1.0, .9, rel)

@lru_cache(None)
def bass_saw(midi, dur, cut=650.0):
    f = hz(midi); n = int(dur * SR); t = np.arange(n) / SR
    x = saw_add(f, n, (0.0, 0.003), cut, 40, int(midi)) * 1.3 + np.sin(2 * np.pi * f * t) * .7
    return x * adsr(n, .004, .12, .7, .03)

@lru_cache(None)
def pluck(midi, dur, bright=1.0, decay=3.0, det=.0015):
    f = hz(midi); n = max(int(dur * SR), int(.06 * SR)); t = np.arange(n) / SR; out = np.zeros(n)
    for k in range(1, int(min(12, SR * .45 / f)) + 1):
        a = (bright if k > 1 else 1.0) / k ** 1.15
        out += a * np.exp(-t * (decay + k * 2.2 / max(bright, .3))) * (np.sin(2 * np.pi * f * k * t) + np.sin(2 * np.pi * f * (1 + det) * k * t + 1.3)) * .5
    return tail_fade(out * np.minimum(1, t * 600), 12)

@lru_cache(None)
def lead_saw(midi, dur, cut=4500.0):
    n = max(int(dur * SR), int(.08 * SR))
    return saw_add(hz(midi), n, (0.0, .006, -.006), cut, 14, int(midi)) * adsr(n, .006, .12, .75, .07)

@lru_cache(None)
def pad(midi, dur, cut=1600.0, att=.6, rel=.9, spread=.004, maxh=12):
    n = int(dur * SR)
    return saw_add(hz(midi), n, (0.0, spread, -spread), cut, maxh, int(midi) + 7) * adsr(n, att, .5, .85, rel)

@lru_cache(None)
def ep(midi, dur, bright=1.0, decay=1.4):
    """FM electric piano (Rhodes-ish): sine carrier, 1:1 modulator, decaying index, tine on top."""
    f = hz(midi); n = int(dur * SR); t = np.arange(n) / SR
    car = np.sin(2 * np.pi * f * t + (1.25 * bright) * np.exp(-t * 4.2) * np.sin(2 * np.pi * f * t))
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 45) * .05
    x = (car * np.exp(-t * decay) * (1 + .12 * np.sin(2 * np.pi * 4.6 * t)) + tine) * np.minimum(1, t * 450)
    return tail_fade(x, 30)

@lru_cache(None)
def bell(midi, dur=2.6):
    f = hz(midi); n = int(dur * SR); t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 1.5), (2.76, .45, 2.4), (5.4, .22, 3.4), (8.93, .1, 4.6)))
    return tail_fade(x * np.minimum(1, t * 500), 40)

@lru_cache(None)
def riser(dur):
    n = int(dur * SR); p = np.arange(n) / SR / dur
    sweep = np.sin(2 * np.pi * np.cumsum(300 * np.exp(p * np.log(10))) / SR) * p ** 2.5 * .5
    return tail_fade(bp(noise(n), 2000, 9000) * p ** 2.2 * .7 + sweep, 8)

@lru_cache(None)
def impact():
    n = int(2.2 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(30 + 45 * np.exp(-t * 6)) / SR) * np.exp(-t * 1.5)
    return tail_fade(np.tanh(boom * 1.4) * .9 + hp(noise(n), 3000) * np.exp(-t * 3.2) * .3, 30)

def ocean(n, period, seed):
    r = np.random.default_rng(seed); t = np.arange(n) / SR; out = np.zeros((2, n))
    for c in (0, 1):
        sw = (.5 + .5 * np.sin(2 * np.pi * t / period - np.pi / 2 + c * .9)) ** 2
        out[c] = lp(r.standard_normal(n), 800 + 0) * (.15 + .85 * sw)
    return out

def crackle(n, seed, density=7.0):
    r = np.random.default_rng(seed); out = np.zeros((2, n))
    for c in (0, 1):
        x = np.zeros(n); k = int(density * n / SR); idx = r.integers(0, n, k)
        x[idx] = r.standard_normal(k) * r.random(k) ** 3
        out[c] = hp(x, 1200) * 2.0 + hp(r.standard_normal(n), 5500) * .006
    return out

# --------------------------------------------------------------------------- harmony & melody
QUAL = {"min": (0, 3, 7), "maj": (0, 4, 7), "min7": (0, 3, 7, 10), "maj7": (0, 4, 7, 11), "min9": (0, 3, 7, 10, 14),
        "maj9": (0, 4, 7, 11, 14), "dom7": (0, 4, 7, 10), "sus2": (0, 2, 7, 12), "add9": (0, 4, 7, 14)}
SCALES = {"minor": [0, 2, 3, 5, 7, 8, 10], "dorian": [0, 2, 3, 5, 7, 9, 10], "major": [0, 2, 4, 5, 7, 9, 11],
          "lydian": [0, 2, 4, 6, 7, 9, 11], "mpent": [0, 3, 5, 7, 10], "Mpent": [0, 2, 4, 7, 9]}

def voicings(root, prog, center=62):
    """Close-position chords that move as little as possible from one bar to the next."""
    out, prev = [], center
    for deg, q in prog:
        notes = [root + deg + i for i in QUAL[q]]; best = None
        for inv in range(len(notes)):
            v = [x + 12 if i < inv else x for i, x in enumerate(notes)]
            v = [x + int(round((center - np.mean(v)) / 12)) * 12 for x in v]
            cost = abs(np.mean(v) - prev)
            if best is None or cost < best[0]: best = (cost, v)
        out.append(sorted(best[1])); prev = float(np.mean(best[1]))
    return out

def bass_midi(root, deg, low=36): return low + (root + deg) % 12

RHY = ["x.xx.x.xx.xx.x..", "x...x.x.x...x.xx", "x.x.xx..x.x.xx..", "xx.x..x.x.x.x...", "x.x..x.x.x..x.x."]
RHY_SPARSE = ["x.....x.x.......", "x.......x.....x.", "x...x.......x.x.", "x.x.......x...x."]

def make_melody(rng, vo, root, scale, lo, hi, sparse=False, nbars=4):
    """4-bar hook: strong beats land on chord tones, weak beats walk the scale, phrase 2 answers phrase 1."""
    pcs = {(root + s) % 12 for s in scale}; pool = [m for m in range(lo, hi + 1) if m % 12 in pcs]
    tpl = RHY_SPARSE if sparse else RHY; pat = tpl[rng.integers(len(tpl))]
    events, prev, first = [], None, None
    for ph in range(nbars // 2):
        onsets = [s for s, c in enumerate(pat) if c == "x"]; notes = []
        for i, s in enumerate(onsets):
            if ph == 1 and first and i < len(onsets) - 3:
                notes.append(first[i]); prev = first[i]; continue
            ch = {m % 12 for m in vo[(ph * 2 + s // 8) % len(vo)]}
            if prev is None or s % 8 == 0 or i == len(onsets) - 1 or rng.random() < .2:
                ref = prev if prev is not None else (lo + hi) // 2
                near = sorted([m for m in pool if m % 12 in ch], key=lambda m: abs(m - ref))[:3]
                m = near[rng.integers(len(near))]
            else:
                idx = min(range(len(pool)), key=lambda j: abs(pool[j] - prev))
                m = pool[min(len(pool) - 1, max(0, idx + int(rng.choice([-2, -1, -1, 1, 1, 2]))))]
            notes.append(m); prev = m
        if ph == 0: first = notes
        for i, s in enumerate(onsets):
            nxt = onsets[i + 1] if i + 1 < len(onsets) else 16
            events.append((ph * 2 + s // 8, s % 8, notes[i], min(nxt - s, 4)))
    by = {}
    for bar, slot, m, ln in events: by.setdefault(bar, []).append((slot, m, ln))
    return by

def plan(secs, bpm):
    beat = 60.0 / bpm; bar = 4 * beat
    names = [nm for nm, b in secs for _ in range(b)]
    return beat, bar, names, int(round(len(names) * bar * SR))

# --------------------------------------------------------------------------- master & export
def finish(name, mix, target_db, fade):
    t0 = time.time(); x = hp(mix.astype(np.float64), 30)
    x *= 10 ** (target_db / 20) / (np.sqrt(np.mean(x ** 2)) + 1e-9)
    x = 0.95 * np.tanh(x / 0.95)
    pk = np.max(np.abs(x)); x *= min(1.0, 0.98 / pk)
    fi = int(.004 * SR); x[:, :fi] *= np.linspace(0, 1, fi)
    f = int(fade * SR); x[:, -f:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, f))
    wav = OUT / f"{name}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype(np.int16).tobytes())
    mp3 = OUT / f"{name}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "72k", str(mp3)], check=True)
    wav.unlink()
    print(f"{name:16s} {x.shape[1] / SR:5.1f}s  {mp3.stat().st_size / 1024:4.0f} KB  rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):5.1f} dB  peak {20 * np.log10(np.max(np.abs(x))):5.1f} dB  ({time.time() - t0:.0f}s)", flush=True)

# =========================================================================== HYPE  (running, 148-172 BPM)
def build_hype(p):
    bpm = p["bpm"]; rng = np.random.default_rng(p["seed"]); root = p["root"]
    secs = [("intro", 4), ("build", 4), ("drop", 8), ("break", 6), ("build2", 2), ("drop2", 10), ("outro", 4)]
    beat, bar, names, n = plan(secs, bpm); vo = voicings(root, p["prog"], 64)
    mel = make_melody(rng, vo, root, SCALES[p.get("scale", "minor")], 69, 88)
    dr, bs, mu, ld, fx = (Bus(n) for _ in range(5))
    K = {"build", "drop", "build2", "drop2", "outro"}; DROP = {"drop", "drop2"}
    kk, cl, hc, ho = kick(.26, 170, 48, 40, 9, 2.2, .4), clap(), hat("c"), hat("o")
    for b, nm in enumerate(names):
        t0 = b * bar; v = vo[b % 4]; bn = bass_midi(root, p["prog"][b % 4][0])
        if nm in K:
            for q in range(4): dr.add(kk, t0 + q * beat, 1.0)
        if nm in DROP:
            for q in (1, 3): dr.add(cl, t0 + q * beat, .55)
            for q in range(4): dr.add(ho, t0 + (q + .5) * beat, .2, pan=.25 if q % 2 else -.25)
        if nm in DROP | {"build2"} or (nm == "build" and b % 2):
            for s in range(16): dr.add(hc, t0 + s * beat / 4, (.2, .09, .14, .09)[s % 4], pan=(-.3, .3)[s % 2])
        elif nm in {"intro", "build", "outro"}:
            for s in range(8): dr.add(hc, t0 + s * beat / 2, .16, pan=(-.2, .2)[s % 2])
        if nm in DROP:
            for q in range(4):
                bs.add(bass_saw(bn, beat * .46), t0 + (q + .5) * beat, .6)
                if nm == "drop2": bs.add(bass_saw(bn + (12 if q % 2 else 0), beat * .2), t0 + (q + .75) * beat, .35)
            for i, m in enumerate(v): mu.add(pad(m, bar, 4200, .01, .12, .007, 14), t0, .2, pan=(-.5, -.17, .17, .5)[i % 4])
            for slot, m, ln in mel.get(b % 4, []):
                d = ln * beat / 2 * .95; ld.add(lead_saw(m, d), t0 + slot * beat / 2, .24)
                if nm == "drop2": ld.add(lead_saw(m + 12, d, 6000), t0 + slot * beat / 2, .12, pan=.35)
        if nm in {"intro", "build", "break", "build2", "outro"}:
            for i, m in enumerate(v): mu.add(pad(m - 12, bar * 1.2, 900, .8, .8), t0, .24, pan=(-.4, -.1, .1, .4)[i % 4])
        if nm in {"intro", "build", "drop2"}:
            seq = (0, 1, 2, 3, 2, 1, 2, 3)
            for s in range(16):
                ld.add(pluck(v[seq[s % 8] % len(v)] + 12, beat * .38, 1.2, 6), t0 + s * beat / 4, .12, pan=(-.45, .45)[s % 2])
        if nm == "break":
            for slot, m, ln in mel.get(b % 4, []): ld.add(pluck(m, ln * beat / 2 * 1.8, 1.4, 2.2), t0 + slot * beat / 2, .3)
        if nm in DROP and b == names.index(nm):
            fx.add(impact(), t0, .75); fx.add(hat("o")[:int(.3 * SR)] * 3, t0, .4)
        if nm in {"build", "build2"} and (b == len(names) - 1 or names[b + 1] != nm):  # snare roll in the last bar
            pos, step, g = 0.0, .5, .35
            while pos < 4:
                dr.add(snare(), t0 + pos * beat, g); g = min(1.0, g + .035); pos += step
                if pos >= 2: step = .25
                if pos >= 3: step = .125
    for nm_ in ("build", "build2"):
        first = names.index(nm_); ln = names.count(nm_)
        fx.add(riser(ln * bar), first * bar, .5)
    d = pump(n, beat, bar, names, K, .62)
    mu.x *= d; bs.x *= pump(n, beat, bar, names, K, .5); ld.x *= pump(n, beat, bar, names, DROP, .25)
    send = ld.x * .55 + mu.x * .25 + fx.x * .4
    return dr.x + bs.x + mu.x + ld.x + fx.x + reverb(send, 2.0, 3) + pingpong(ld.x, beat * .75, .4) * .3

# =========================================================================== FRESH  (bright, 112-126 BPM)
def build_fresh(p):
    bpm = p["bpm"]; rng = np.random.default_rng(p["seed"]); root = p["root"]
    secs = [("intro", 4), ("A", 8), ("B", 8), ("break", 4), ("C", 8), ("outro", 4)]
    beat, bar, names, n = plan(secs, bpm); vo = voicings(root, p["prog"], 66)
    mel = make_melody(rng, vo, root, SCALES[p.get("scale", "major")], 72, 91)
    dr, bs, mu, ld, fx = (Bus(n) for _ in range(5))
    K = {"A", "B", "C", "outro"}; G = {"A", "B", "C"}
    kk, cl = kick(.3, 130, 50, 30, 7, 1.5, .25), clap()
    bass_pat = [(0, 0), (.75, 0), (1.5, 12), (2, 0), (2.75, 0), (3.5, 7)]
    for b, nm in enumerate(names):
        t0 = b * bar; v = vo[b % 4]; bn = bass_midi(root, p["prog"][b % 4][0])
        if nm in K:
            for q in range(4): dr.add(kk, t0 + q * beat, .95)
        if nm in {"B", "C"}:
            for q in (1, 3): dr.add(cl, t0 + q * beat, .5)
            for s in range(16): dr.add(hat("t"), t0 + s * beat / 4, (.05, .08, .1, .08)[s % 4], pan=(-.3, .3)[s % 2])
        if nm in G | {"intro", "outro"}:
            for q in range(4): dr.add(hat("o"), t0 + (q + .5) * beat, .17 if nm in G else .1, pan=.2 if q % 2 else -.2)
        if nm in G:
            for s in range(16): dr.add(shaker(), t0 + s * beat / 4 + (.012 if s % 2 else 0), (.12, .06, .09, .06)[s % 4], pan=(.4, -.4)[s % 2])
            for off, iv in bass_pat: bs.add(bass_saw(bn + iv, beat * .3, 520), t0 + off * beat, .6)
            for off in ((.5, 2.5) if nm == "A" else (.5, 1.5, 2.5, 3.5)):
                for i, m in enumerate(v): mu.add(pluck(m, beat * .4, 1.5, 7), t0 + off * beat, .1, pan=(-.4, -.13, .13, .4)[i % 4])
        if nm in {"A", "C", "intro", "outro", "break"}:
            for i, m in enumerate(v): mu.add(pad(m, bar * 1.15, 1500, .5, .8), t0, .12, pan=(-.5, -.17, .17, .5)[i % 4])
        if nm == "break":
            for i, m in enumerate(v): ld.add(ep(m, bar * .95, 1.0, 1.2), t0 + i * .03, .13, pan=(-.4, -.13, .13, .4)[i % 4])
        if nm in {"intro", "B", "C", "break"}:
            seq = (0, 1, 2, 3, 2, 1, 3, 2)
            for s in range(16): ld.add(pluck(v[seq[s % 8] % len(v)] + 12, beat * .3, 1.6, 8), t0 + s * beat / 4, .09, pan=(-.5, .5)[s % 2])
        if nm in {"B", "C", "break"} or (nm == "A" and b % 2):
            for slot, m, ln in mel.get(b % 4, []): ld.add(pluck(m, ln * beat / 2 * 1.6, 1.7, 2.4), t0 + slot * beat / 2, .26)
        if nm in {"B", "C"} and b == names.index(nm): fx.add(impact(), t0, .45)
    fx.add(riser(4 * bar), names.index("break") * bar, .4)
    mu.x *= pump(n, beat, bar, names, K - {"outro"}, .5); bs.x *= pump(n, beat, bar, names, K, .4)
    send = ld.x * .5 + mu.x * .25 + fx.x * .4
    return dr.x + bs.x + mu.x + ld.x + fx.x + reverb(send, 1.7, 5) + pingpong(ld.x, beat * .75, .42) * .3

# =========================================================================== MOODY  (dark lo-fi / trap, 88-104 BPM)
def build_moody(p):
    bpm = p["bpm"]; rng = np.random.default_rng(p["seed"]); root = p["root"]
    secs = [("intro", 2), ("A", 8), ("B", 8), ("break", 4), ("C", 8), ("outro", 2)]
    beat, bar, names, n = plan(secs, bpm); vo = voicings(root, p["prog"], 60)
    mel = make_melody(rng, vo, root, SCALES[p.get("scale", "dorian")], 72, 89, sparse=True)
    dr, bs, mu, ld, sn = (Bus(n) for _ in range(5))
    G = {"A", "B", "C"}; kk = kick(.45, 110, 42, 22, 5.5, 1.3, .12); sd, cp = snare(.3, 175, .6, .6, 14, 1200), clap()
    for b, nm in enumerate(names):
        t0 = b * bar; v = vo[b % 4]; bn = bass_midi(root, p["prog"][b % 4][0], 29)
        for i, m in enumerate(v):   # rolled, slightly detuned EP chord
            dt = float(rng.uniform(-.003, .003))
            mu.add(ep(m + dt, beat * 2.4, .9, 1.3), t0 + i * .028, .15, pan=(-.35, -.1, .1, .35)[i % 4])
            if b % 2 and nm != "intro" and i >= 1: mu.add(ep(m, beat * 1.4, .8, 1.8), t0 + 2.5 * beat + i * .02, .09, pan=(.2, -.2)[i % 2])
        if nm in G | {"break"}:
            for i, m in enumerate(v): mu.add(pad(m - 12, bar * 1.2, 650, 1.2, 1.0), t0, .17, pan=(-.4, -.1, .1, .4)[i % 4])
        if nm in G:
            ks = [0, 2.75] if nm == "A" else [0, 1.75, 2.5]
            if b % 2: ks = ks + [3.5]
            for q, off in enumerate(ks):
                dr.add(kk, t0 + off * beat, .85)
                nxt = ks[q + 1] if q + 1 < len(ks) else 4.0
                bs.add(sub808(bn, min(max(nxt - off, .5), 2.0) * beat), t0 + off * beat, .85)
            sn.add(sd, t0 + 2 * beat, .75); sn.add(cp, t0 + 2 * beat, .3)
            for s in range(16):
                base = .13 if s % 2 == 0 else (.07 if rng.random() < .4 else 0)
                if base: dr.add(hat("c"), t0 + (s + (.18 if s % 2 else 0)) * beat / 4, base, pan=float(rng.uniform(-.3, .3)))
            if b % 4 == 3:
                for r in range(6): dr.add(hat("c"), t0 + 3 * beat + r * beat / 6, .06 + .03 * r, pan=float(rng.uniform(-.3, .3)))
        if nm in {"B", "C"} or (nm == "break" and b % 2 == 0):
            for slot, m, ln in mel.get(b % 4, []): ld.add(pluck(m, ln * beat / 2 * 2, .8, 2.2), t0 + slot * beat / 2, .24, pan=.1)
    n_ = crackle(n, p["seed"]); amb = n_ * .5
    mu.x = lp(mu.x, 6800)
    send = ld.x * .6 + mu.x * .35 + sn.x * .8
    return dr.x + bs.x + mu.x + ld.x + sn.x * .8 + amb + reverb(send, 2.4, 9, 3800) + pingpong(ld.x, beat * .75, .5, 6, 2800) * .45

# =========================================================================== CALM  (ambient, 54-66 BPM)
def build_calm(p):
    bpm = p["bpm"]; rng = np.random.default_rng(p["seed"]); root = p["root"]
    secs = [("intro", 2), ("A", 6), ("B", 6), ("C", 4), ("outro", 2)]
    beat, bar, names, n = plan(secs, bpm); vo = voicings(root, p["prog"], 58)
    scale = SCALES[p.get("scale", "Mpent")]; pool = [m for m in range(76, 97) if (m - root) % 12 in scale]
    pd, sb, ky, bl = (Bus(n) for _ in range(4))
    for b, nm in enumerate(names):
        t0 = b * bar; v = vo[b % 4]; deg = p["prog"][b % 4][0]
        for i, m in enumerate(v): pd.add(pad(m, bar * 1.35, 1100, 1.6, 1.6, .003, 8), t0, .13, pan=(-.55, -.18, .18, .55)[i % 4])
        if b % 2 == 0: sb.add(sine_tone(bass_midi(root, deg, 33), bar * 2.2, 2.0, 2.5), t0, .2)
        if nm in {"A", "B", "C"}:
            for i, m in enumerate(v): ky.add(ep(m, bar * .9, .55, 1.0), t0 + i * .06, .1, pan=(-.4, -.13, .13, .4)[i % 4])
            if b % 2: [ky.add(ep(m, beat * 2, .5, 1.6), t0 + 2.5 * beat + j * .05, .06, pan=(.3, -.3)[j % 2]) for j, m in enumerate(v[-2:])]
        if nm in {"B", "C"}:
            for q in sorted(rng.choice([0, 1.5, 2, 3], 2, replace=False)):
                bl.add(bell(int(pool[rng.integers(len(pool))]), 3.0), t0 + float(q) * beat, .1, pan=float(rng.uniform(-.6, .6)))
        if nm == "C":
            for s in range(8): bl.add(pluck(v[s % len(v)] + 12 * (1 + s // 4 % 2), beat * 1.5, .7, 1.6), t0 + s * beat / 2, .12, pan=(-.3, .3)[s % 2])
        if nm in {"B", "C"}:   # barely-there heartbeat on beats 1 and 3
            for q in (0, 2): sb.add(kick(.5, 70, 46, 14, 5, 1.0, 0.0), t0 + q * beat, .12)
    air = ocean(n, bar * 2, p["seed"]) * .5
    wet = pd.x * .7 + ky.x + bl.x
    return pd.x + sb.x + ky.x * .8 + bl.x + air + reverb(wet, 4.2, 13, 4200) * 1.1 + pingpong(bl.x, beat * 1.5, .5, 5, 3000) * .5

# --------------------------------------------------------------------------- catalogue
# One playlist per workout (see src/app/music/playlists.ts):
#   running   -> hype EDM          cycling  -> driving melodic house   walking   -> bright feel-good house
#   yoga      -> slow ambient      stretching -> soft ambient           squats    -> dark lo-fi groove
#   push-ups  -> heavier dark groove
P = lambda *a: list(a)
CALM_DB, MOODY_DB, FRESH_DB, HYPE_DB = -21, -16, -14.5, -13.5
TRACKS = {
  # id: (builder, params, target RMS dB, fade seconds)
  # --- running
  "overdrive":      (build_hype,  dict(bpm=148, root=57, seed=31, prog=P((0, "min7"), (8, "maj7"), (3, "maj7"), (10, "dom7"))), HYPE_DB, 2),
  "red-line":       (build_hype,  dict(bpm=156, root=53, seed=35, prog=P((0, "min7"), (3, "maj7"), (8, "maj7"), (7, "dom7"))), HYPE_DB, 2),
  "fire-lap":       (build_hype,  dict(bpm=160, root=52, seed=32, prog=P((0, "min7"), (5, "min7"), (8, "maj7"), (7, "dom7")), scale="dorian"), HYPE_DB, 2),
  "adrenaline":     (build_hype,  dict(bpm=172, root=50, seed=33, prog=P((0, "min"), (10, "maj"), (8, "maj"), (7, "maj"))), HYPE_DB, 2),
  # --- cycling (driving, melodic, minor-key house)
  "open-road":      (build_fresh, dict(bpm=128, root=57, seed=41, prog=P((0, "min7"), (8, "maj7"), (3, "maj7"), (10, "dom7")), scale="dorian"), FRESH_DB, 3),
  "hill-climb":     (build_fresh, dict(bpm=132, root=52, seed=42, prog=P((0, "min9"), (5, "min7"), (8, "maj7"), (7, "dom7")), scale="minor"), FRESH_DB, 3),
  "cadence":        (build_fresh, dict(bpm=136, root=55, seed=43, prog=P((0, "min"), (8, "maj"), (10, "maj"), (3, "maj")), scale="minor"), FRESH_DB, 3),
  "power-surge":    (build_hype,  dict(bpm=140, root=55, seed=34, prog=P((0, "min"), (8, "maj"), (10, "maj"), (3, "maj"))), HYPE_DB, 2),
  # --- walking (bright, major)
  "green-light":    (build_fresh, dict(bpm=112, root=65, seed=24, prog=P((0, "maj7"), (2, "min7"), (5, "maj7"), (7, "dom7"))), FRESH_DB, 3),
  "citrus-morning": (build_fresh, dict(bpm=116, root=60, seed=21, prog=P((0, "maj7"), (7, "maj"), (9, "min7"), (5, "maj7"))), FRESH_DB, 3),
  "sunrise-stride": (build_fresh, dict(bpm=120, root=62, seed=22, prog=P((0, "maj9"), (9, "min7"), (5, "maj7"), (7, "sus2")), scale="lydian"), FRESH_DB, 3),
  "cool-breeze":    (build_fresh, dict(bpm=124, root=55, seed=23, prog=P((0, "add9"), (5, "maj7"), (9, "min7"), (7, "dom7"))), FRESH_DB, 3),
  # --- yoga
  "still-water":    (build_calm,  dict(bpm=60, root=48, seed=1,  prog=P((0, "maj9"), (9, "min9"), (5, "maj9"), (7, "sus2"))), CALM_DB, 4),
  "sun-salutation": (build_calm,  dict(bpm=62, root=52, seed=5,  prog=P((0, "maj9"), (5, "add9"), (9, "min9"), (7, "sus2"))), CALM_DB, 4),
  "slow-breath":    (build_calm,  dict(bpm=66, root=45, seed=2,  prog=P((0, "min9"), (8, "maj9"), (5, "min7"), (10, "add9")), scale="mpent"), CALM_DB, 4),
  # --- stretching
  "morning-light":  (build_calm,  dict(bpm=54, root=50, seed=3,  prog=P((0, "maj9"), (7, "add9"), (9, "min7"), (5, "maj7"))), CALM_DB, 4),
  "deep-forest":    (build_calm,  dict(bpm=58, root=43, seed=4,  prog=P((0, "sus2"), (5, "maj9"), (0, "add9"), (7, "sus2"))), CALM_DB, 4),
  "soft-landing":   (build_calm,  dict(bpm=52, root=47, seed=6,  prog=P((0, "min9"), (8, "maj9"), (3, "maj9"), (5, "add9")), scale="mpent"), CALM_DB, 4),
  # --- squats (slow, heavy, dark)
  "after-hours":    (build_moody, dict(bpm=88, root=50, seed=13, prog=P((0, "min7"), (10, "maj7"), (8, "maj7"), (7, "min7"))), MOODY_DB, 3),
  "iron-will":      (build_moody, dict(bpm=90, root=55, seed=15, prog=P((0, "min7"), (8, "maj7"), (3, "maj7"), (10, "dom7"))), MOODY_DB, 3),
  "midnight-miles": (build_moody, dict(bpm=92, root=57, seed=11, prog=P((0, "min9"), (5, "min7"), (8, "maj7"), (7, "dom7"))), MOODY_DB, 3),
  # --- push-ups (a little faster and harder)
  "neon-rain":      (build_moody, dict(bpm=100, root=54, seed=12, prog=P((0, "min9"), (8, "maj7"), (3, "maj9"), (10, "dom7"))), MOODY_DB, 3),
  "shadow-lap":     (build_moody, dict(bpm=104, root=52, seed=14, prog=P((0, "min"), (8, "maj"), (3, "maj"), (10, "maj")), scale="minor"), MOODY_DB, 3),
  "last-rep":       (build_moody, dict(bpm=108, root=50, seed=16, prog=P((0, "min"), (10, "maj"), (8, "maj"), (7, "maj")), scale="minor"), MOODY_DB, 3),
}

if __name__ == "__main__":
    want = sys.argv[1:] or list(TRACKS)
    for old in OUT.glob("*.mp3"):
        if not sys.argv[1:] and old.stem not in TRACKS: old.unlink()   # drop v1 tracks on a full rebuild
    for name in want:
        fn, params, db, fade = TRACKS[name]
        finish(name, fn(params), db, fade)
