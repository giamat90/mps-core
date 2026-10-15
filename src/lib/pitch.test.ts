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

