import { describe, it, expect } from "vitest";
import { autocorrelatePitch } from "./pitch";

function sine(freq: number, sampleRate: number, amplitude = 0.5, length = 2048) {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return x;
}

function voiceLike(f0: number, sampleRate: number, amplitude = 0.4, length = 2048) {
  const x = new Float32Array(length);
  for (const [k, a] of [[1, 1], [2, 0.6], [3, 0.4], [4, 0.2]] as const) {
    for (let i = 0; i < length; i++) x[i] += (amplitude * a * Math.sin((2 * Math.PI * f0 * k * i) / sampleRate)) / 1.6;
  }
  return x;
}

function noise(length = 2048) {
  let s = 7;
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = (((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1) * 0.5;
  return x;
}

describe("autocorrelatePitch", () => {
  it.each([44100, 48000])("detects sines from 110 to 659 Hz within 1%% at %i Hz", (sr) => {
    for (const f of [110, 196, 261.63, 440, 659.25]) {
      const got = autocorrelatePitch(sine(f, sr), sr);
      expect(got, `${f} Hz`).not.toBeNull();
      expect(Math.abs(got! - f) / f).toBeLessThan(0.01);
    }
  });

  it("finds the fundamental of a harmonic-rich tone, not an overtone", () => {
    const got = autocorrelatePitch(voiceLike(220, 44100), 44100);
    expect(got).not.toBeNull();
    expect(Math.abs(got! - 220) / 220).toBeLessThan(0.02);
  });

  it("returns null for silence and for a signal below the RMS floor", () => {
    expect(autocorrelatePitch(new Float32Array(2048), 44100)).toBeNull();
    expect(autocorrelatePitch(sine(220, 44100, 0.005), 44100)).toBeNull();
  });

  it("returns null for broadband noise", () => {
    expect(autocorrelatePitch(noise(), 44100)).toBeNull();
  });

  it("returns null outside 65-1400 Hz", () => {
    expect(autocorrelatePitch(sine(40, 44100), 44100)).toBeNull();
    expect(autocorrelatePitch(sine(2000, 44100), 44100)).toBeNull();
  });

  it("returns null for windows too short to correlate", () => {
    expect(autocorrelatePitch(new Float32Array(0), 44100)).toBeNull();
    expect(autocorrelatePitch(new Float32Array([0.5]), 44100)).toBeNull();
  });

  it("does not modify the samples it is given", () => {
    const x = sine(220, 44100);
    const copy = x.slice();
    autocorrelatePitch(x, 44100);
    expect(x).toEqual(copy);
  });

  it("is deterministic", () => {
    const x = voiceLike(330, 48000);
    expect(autocorrelatePitch(x, 48000)).toBe(autocorrelatePitch(x, 48000));
  });
});

describe("autocorrelatePitch with { fast: true }", () => {
  const FAST = { fast: true } as const;

  it.each([44100, 48000, 16000])("agrees with the exact path within 1% on sines from 110 to 1318 Hz at %i Hz", (sr) => {
    for (const f of [110, 196, 261.63, 440, 659.25, 880, 1318.5]) {
      const x = sine(f, sr);
      const exact = autocorrelatePitch(x, sr);
      const fast = autocorrelatePitch(x, sr, FAST);
      expect(exact, `exact ${f}`).not.toBeNull();
      expect(fast, `fast ${f}`).not.toBeNull();
      expect(Math.abs(fast! - f) / f, `fast ${f} at ${sr}`).toBeLessThan(0.01);
    }
  });

  it("finds the fundamental of a harmonic-rich tone, not an overtone", () => {
    for (const f0 of [110, 220, 330]) {
      const got = autocorrelatePitch(voiceLike(f0, 48000), 48000, FAST);
      expect(got, `${f0}`).not.toBeNull();
      expect(Math.abs(got! - f0) / f0).toBeLessThan(0.02);
    }
  });

  it("rejects what the exact path rejects: silence, noise, out of range, too short", () => {
    expect(autocorrelatePitch(new Float32Array(2048), 48000, FAST)).toBeNull();
    expect(autocorrelatePitch(sine(220, 48000, 0.005), 48000, FAST)).toBeNull();
    expect(autocorrelatePitch(noise(), 48000, FAST)).toBeNull();
    expect(autocorrelatePitch(sine(40, 48000), 48000, FAST)).toBeNull();
    expect(autocorrelatePitch(sine(2000, 48000), 48000, FAST)).toBeNull();
    expect(autocorrelatePitch(new Float32Array([0.5, 0.4]), 48000, FAST)).toBeNull();
  });

  it("is several times cheaper than the exact path", () => {
    const x = voiceLike(220, 48000);
    const time = (opts?: { fast: boolean }) => {
      const t0 = performance.now();
      for (let i = 0; i < 15; i++) autocorrelatePitch(x, 48000, opts);
      return performance.now() - t0;
    };
    time();
    time(FAST);
    expect(time(FAST) * 4).toBeLessThan(time());
  });
});

// A glottal-like pulse train through formant resonators. With the first formant
// on the 2nd or 3rd harmonic (what head voice does) the strongest periodicity
// in the window is at half or a third of the period, which an earlier fast
// path read an octave too high. Above about 650 Hz with the formant on the 3rd
// harmonic the fast path can still read an octave up (a known limit).
function formantVoice(f0: number, f1: number, sampleRate: number, highPassHz = 0, length = 2048) {
  const n = length * 2;
  const pulses = new Float32Array(n);
  let phase = 0;
  let tilt = 0;
  for (let i = 0; i < n; i++) {
    phase += f0 / sampleRate;
    if (phase >= 1) {
      phase -= 1;
      tilt += 1;
    }
    tilt *= 0.97;
    pulses[i] = tilt;
  }
  const out = new Float32Array(n);
  for (const [k, fc] of [f1, Math.min(3800, f1 * 2.1), Math.min(4500, f1 * 3.3)].entries()) {
    const r = Math.exp((-Math.PI * (60 + 30 * k)) / sampleRate);
    const th = (2 * Math.PI * fc) / sampleRate;
    const a1 = -2 * r * Math.cos(th);
    const a2 = r * r;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const v = (1 - r) * pulses[i] - a1 * y1 - a2 * y2;
      out[i] += [1, 0.6, 0.3][k] * v;
      y2 = y1;
      y1 = v;
    }
  }
  if (highPassHz > 0) {
    const rc = 1 / (2 * Math.PI * highPassHz);
    const a = rc / (rc + 1 / sampleRate);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < n; i++) {
      const v = a * (prevOut + out[i] - prevIn);
      prevIn = out[i];
      prevOut = v;
      out[i] = v;
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const window = out.slice(length, length * 2);
  for (let i = 0; i < window.length; i++) window[i] = (0.5 * window[i]) / peak;
  return window;
}

describe("autocorrelatePitch with { fast: true } on head voice", () => {
  const FAST = { fast: true } as const;

  it.each([
    [44100, 0],
    [48000, 0],
    [48000, 250],
  ])("keeps the octave when a formant sits on the 2nd or 3rd harmonic (%i Hz, high-pass %i Hz)", (sr, hp) => {
    for (const multiple of [2, 3]) {
      for (let f0 = 190; f0 <= 640; f0 *= 1.07) {
        const x = formantVoice(f0, multiple * f0, sr, hp);
        const got = autocorrelatePitch(x, sr, FAST);
        expect(got, `f0 ${f0.toFixed(0)} F1 ${multiple}x`).not.toBeNull();
        expect(Math.abs(Math.log2(got! / f0)), `f0 ${f0.toFixed(0)} F1 ${multiple}x`).toBeLessThan(0.05);
      }
    }
  });
});

