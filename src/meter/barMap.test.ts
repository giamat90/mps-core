import { describe, it, expect } from "vitest";
import {
  barGroups, barIndexAt, defaultGroups, dominantMeter, meterRuns, nextPulse, pulseLevels, pulseSeconds, pulseTimes,
  pulsesBetween, repeatingCycle, unitBpm, validateMap, type BarMap,
} from "./barMap";

const map = (bars: BarMap["bars"], end = 30): BarMap => ({ version: 1, bars, end, source: "edited" });

describe("defaultGroups", () => {
  it.each([
    [1, [1]], [3, [3]], [4, [4]], [5, [3, 2]], [6, [3, 3]], [7, [3, 2, 2]], [8, [3, 3, 2]],
    [9, [3, 3, 3]], [10, [3, 3, 2, 2]], [11, [3, 3, 3, 2]], [12, [3, 3, 3, 3]], [13, [3, 3, 3, 2, 2]],
  ])("splits %i pulses as %j", (n, expected) => {
    expect(defaultGroups(n)).toEqual(expected);
    expect(expected.reduce((a, b) => a + b, 0)).toBe(n);
  });

  it("uses the bar's own groups when they add up and the usual ones when they do not", () => {
    expect(barGroups({ start: 0, num: 7, den: 8, groups: [2, 2, 3] })).toEqual([2, 2, 3]);
    expect(barGroups({ start: 0, num: 7, den: 8, groups: [2, 2] })).toEqual([3, 2, 2]);
  });
});

describe("accents", () => {
  it("marks the bar start, the start of each other group, and the rest", () => {
    expect(pulseLevels({ start: 0, num: 7, den: 8, groups: [2, 2, 3] })).toEqual([0, 2, 1, 2, 1, 2, 2]);
    expect(pulseLevels({ start: 0, num: 4, den: 4 })).toEqual([0, 2, 2, 2]);
  });
});

describe("a bar map in time", () => {
  const m = map([{ start: 2, num: 4, den: 4 }, { start: 4, num: 7, den: 8 }, { start: 5.4, num: 4, den: 4 }], 7.4);

  it("spaces the pulses of a bar evenly over it", () => {
    expect(pulseTimes(m, 0)).toEqual([2, 2.5, 3, 3.5]);
    expect(pulseSeconds(m, 1)).toBeCloseTo(0.2, 6);
    expect(unitBpm(m, 1)).toBeCloseTo(300, 6);
  });

  it("finds the bar playing at a time, and none before the first or after the end", () => {
    expect(barIndexAt(m, 1.9)).toBe(-1);
    expect(barIndexAt(m, 2)).toBe(0);
    expect(barIndexAt(m, 3.99)).toBe(0);
    expect(barIndexAt(m, 4)).toBe(1);
    expect(barIndexAt(m, 7.39)).toBe(2);
    expect(barIndexAt(m, 7.4)).toBe(-1);
  });

  it("lists the pulses in a span with their bar, beat and accent", () => {
    const got = pulsesBetween(m, 3.5, 4.5);
    expect(got.map((p) => [p.bar, p.beat, p.level])).toEqual([[0, 3, 2], [1, 0, 0], [1, 1, 2], [1, 2, 2]]);
    expect(pulsesBetween(m, 4.5, 5).map((p) => [p.beat, p.level])).toEqual([[3, 1], [4, 2]]);
    expect(got[0].time).toBe(3.5);
  });

  it("starts at the first bar when asked from before it", () => {
    expect(pulsesBetween(m, 0, 2.6).map((p) => p.time)).toEqual([2, 2.5]);
  });

  it("gives the next pulse at or after a time", () => {
    expect(nextPulse(m, 2.1)?.time).toBe(2.5);
    expect(nextPulse(m, 2.5)?.time).toBe(2.5);
    expect(nextPulse(m, 7.4)).toBeNull();
  });
});

describe("what a song is made of", () => {
  const bars = [
    { start: 0, num: 4, den: 4 }, { start: 2, num: 4, den: 4 }, { start: 4, num: 7, den: 4 }, { start: 7.5, num: 4, den: 4 },
  ];
  const m = map(bars, 9.5);

  it("runs consecutive bars of one signature together", () => {
    expect(meterRuns(m).map((r) => [r.num, r.den, r.first, r.bars])).toEqual([[4, 4, 0, 2], [7, 4, 2, 1], [4, 4, 3, 1]]);
  });

  it("names the signature that covers the most time", () => {
    const d = dominantMeter(m);
    expect(d).toMatchObject({ num: 4, den: 4 });
    expect(d?.share).toBeCloseTo(6 / 9.5, 6);
  });

  it("finds the cycle of a song that alternates signatures", () => {
    const alt = map([5, 7, 5, 7, 5, 7].map((n, i) => ({ start: i * 3, num: n, den: 8 })), 18);
    expect(repeatingCycle(alt)).toEqual([5, 7]);
    expect(repeatingCycle(m)).toBeNull();
  });

  it("calls a steady meter a cycle of one", () => {
    const steady = map([0, 1, 2, 3].map((i) => ({ start: i * 2, num: 4, den: 4 })), 8);
    expect(repeatingCycle(steady)).toEqual([4]);
  });
});

describe("validateMap", () => {
  const ok = map([{ start: 0, num: 4, den: 4 }, { start: 2, num: 4, den: 4 }], 4);

  it("accepts a good map", () => {
    expect(validateMap(ok)).toBeNull();
  });

  it.each([
    ["no bars", { ...ok, bars: [] }],
    ["bars out of order", { ...ok, bars: [ok.bars[1], ok.bars[0]] }],
    ["a unit that is not a note", { ...ok, bars: [{ start: 0, num: 4, den: 5 }] }],
    ["too many pulses", { ...ok, bars: [{ start: 0, num: 33, den: 4 }], end: 60 }],
    ["groups that do not add up", { ...ok, bars: [{ start: 0, num: 7, den: 8, groups: [3, 3] }] }],
    ["a pulse too short to hear", { ...ok, bars: [{ start: 0, num: 32, den: 8 }], end: 1 }],
    ["no length", { ...ok, end: 0 }],
  ])("rejects %s", (_name, bad) => {
    expect(validateMap(bad as BarMap)).not.toBeNull();
  });
});
