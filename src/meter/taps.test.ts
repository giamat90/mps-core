import { describe, it, expect } from "vitest";
import { barsFromBarTaps, barsFromBeatTaps, cleanTaps, fitTaps } from "./taps";

const every = (period: number, n: number, first = 0) => Array.from({ length: n }, (_, i) => first + i * period);

describe("cleanTaps", () => {
  it("sorts and drops a double press", () => {
    expect(cleanTaps([2, 1, 1.03, 3])).toEqual([1, 2, 3]);
  });
});

describe("fitTaps", () => {
  it("finds the period and phase of steady taps", () => {
    const fit = fitTaps(every(0.5, 12, 1.2))!;
    expect(fit.period).toBeCloseTo(0.5, 6);
    expect(fit.first).toBeCloseTo(1.2, 6);
    expect(fit.scatter).toBeCloseTo(0, 6);
  });

  it("is not thrown by a missed tap or a late one", () => {
    const taps = every(0.5, 12, 1).filter((_, i) => i !== 5).map((t, i) => (i === 7 ? t + 0.05 : t));
    const fit = fitTaps(taps)!;
    expect(fit.period).toBeCloseTo(0.5, 1);
    expect(fit.scatter).toBeLessThan(0.1);
  });

  it("reports scatter when the taps wander", () => {
    const rough = every(0.5, 12).map((t, i) => t + (i % 2 ? 0.08 : -0.08));
    expect(fitTaps(rough)!.scatter).toBeGreaterThan(0.1);
  });

  it("needs three taps", () => {
    expect(fitTaps([1, 2])).toBeNull();
  });
});

describe("bars from taps on the first beat", () => {
  it("counts the pulses between taps, so seven comes out as seven", () => {
    const got = barsFromBarTaps([2, 5.5, 9], { den: 8, pulse: 0.5 })!;
    expect(got.bars).toEqual([{ start: 2, num: 7, den: 8 }, { start: 5.5, num: 7, den: 8 }]);
    expect(got.closing).toBe(9);
  });

  it("follows a changing meter", () => {
    const got = barsFromBarTaps([0, 2.5, 6, 8.5], { den: 8, pulse: 0.5 })!;
    expect(got.bars.map((b) => b.num)).toEqual([5, 7, 5]);
  });

  it("needs two taps", () => {
    expect(barsFromBarTaps([2], { den: 4, pulse: 0.5 })).toBeNull();
  });
});

describe("bars from taps on every beat", () => {
  it("makes a bar of every group of taps", () => {
    const got = barsFromBeatTaps(every(0.5, 14), { den: 8, perBar: 7 })!;
    expect(got.bars).toEqual([{ start: 0, num: 7, den: 8 }, { start: 3.5, num: 7, den: 8 }]);
    expect(got.closing).toBeCloseTo(7, 6);
  });

  it("keeps a last group that is short", () => {
    const got = barsFromBeatTaps(every(0.5, 10), { den: 4, perBar: 4 })!;
    expect(got.bars.map((b) => b.num)).toEqual([4, 4, 2]);
  });
});
