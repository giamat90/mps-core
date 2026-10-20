import { describe, it, expect } from "vitest";
import {
  fillCycle, gridMap, mergeBars, relabelBars, removeBar, replaceBars, rescalePulse, setBarStart, shiftBars, shiftDownbeat, splitBar,
} from "./barEdit";
import { validateMap, type BarMap } from "./barMap";

const base = (): BarMap => ({
  version: 1,
  bars: [{ start: 1, num: 4, den: 4 }, { start: 3, num: 4, den: 4 }, { start: 5, num: 4, den: 4 }],
  end: 7,
  source: "detected",
  confidence: 0.4,
});

describe("gridMap", () => {
  it("makes steady bars from the first one to the end", () => {
    const m = gridMap({ first: 1, pulse: 0.5, num: 4, den: 4, end: 9 })!;
    expect(m.bars.map((b) => b.start)).toEqual([1, 3, 5, 7]);
    expect(m.source).toBe("grid");
    expect(validateMap(m)).toBeNull();
  });

  it("refuses a pulse too fast to hear or a signature that is not one", () => {
    expect(gridMap({ first: 0, pulse: 0.01, num: 4, den: 4, end: 9 })).toBeNull();
    expect(gridMap({ first: 0, pulse: 0.5, num: 4, den: 3, end: 9 })).toBeNull();
  });
});

describe("moving a bar line", () => {
  it("moves it and marks the map edited, dropping the detector's confidence", () => {
    const m = setBarStart(base(), 1, 3.2);
    expect(m.bars[1].start).toBe(3.2);
    expect(m.source).toBe("edited");
    expect(m.confidence).toBeUndefined();
  });

  it("stops at its neighbours", () => {
    expect(setBarStart(base(), 1, 99).bars[1].start).toBeCloseTo(5 - 4 * 0.05, 6);
    expect(setBarStart(base(), 1, -5).bars[1].start).toBeCloseTo(1 + 4 * 0.05, 6);
  });

  it("lets the first bar go back to the start of the song", () => {
    expect(setBarStart(base(), 0, -5).bars[0].start).toBe(0);
  });

  it("shifts the whole grid, keeping it inside the song", () => {
    expect(shiftBars(base(), 0.5).bars.map((b) => b.start)).toEqual([1.5, 3.5, 5.5]);
    expect(shiftBars(base(), -9).bars[0].start).toBe(0);
    expect(shiftBars(base(), 0)).toEqual(base());
  });
});

describe("making another beat the first", () => {
  it("moves every bar line a pulse later and the end with them, keeping every bar's length", () => {
    const m = shiftDownbeat(base(), 1)!;
    expect(m.bars.map((b) => b.start)).toEqual([1.5, 3.5, 5.5]);
    expect(m.end).toBe(7.5);
    expect(validateMap(m)).toBeNull();
  });

  it("moves them earlier for a negative count, and uses each bar's own pulse", () => {
    const mixed = relabelBars(base(), 1, 1, { num: 8, den: 8 })!;
    const m = shiftDownbeat(mixed, -1)!;
    expect(m.bars.map((b) => b.start)).toEqual([0.5, 2.75, 4.5]);
  });

  it("refuses to move the first bar before the song, or by nothing", () => {
    expect(shiftDownbeat(base(), -3)).toBeNull();
    expect(shiftDownbeat(base(), 0)).toBeNull();
  });
});

describe("splitting and joining", () => {
  it("splits a bar where asked, giving each half the pulses that fit", () => {
    const m = splitBar(base(), 0, 2.5)!;
    expect(m.bars.slice(0, 3).map((b) => [b.start, b.num])).toEqual([[1, 3], [2.5, 1], [3, 4]]);
  });

  it("will not split a one-pulse bar, or outside the bar", () => {
    const one = relabelBars(base(), 0, 0, { num: 1 })!;
    expect(splitBar(one, 0, 2)).toBeNull();
    expect(splitBar(base(), 0, 3)).toBeNull();
    expect(splitBar(base(), 0, 1)).toBeNull();
  });

  it("joins two bars into one with the pulses of both", () => {
    const m = mergeBars(base(), 0)!;
    expect(m.bars.map((b) => [b.start, b.num])).toEqual([[1, 8], [5, 4]]);
  });

  it("will not join bars with different units", () => {
    const m = relabelBars(base(), 1, 1, { den: 8 })!;
    expect(mergeBars(m, 0)).toBeNull();
  });

  it("removes a bar, the one before running on over its time", () => {
    const m = removeBar(base(), 1)!;
    expect(m.bars.map((b) => b.start)).toEqual([1, 5]);
    expect(removeBar(m, 0)!.bars.map((b) => b.start)).toEqual([5]);
    expect(removeBar(removeBar(m, 0)!, 0)).toBeNull();
  });
});

describe("relabelling", () => {
  it("changes the signature of a range without moving a bar line", () => {
    const m = relabelBars(base(), 1, 2, { num: 7, den: 8 })!;
    expect(m.bars.map((b) => [b.start, b.num, b.den])).toEqual([[1, 4, 4], [3, 7, 8], [5, 7, 8]]);
  });

  it("keeps given groups, and drops them when the count changes without new ones", () => {
    const grouped = relabelBars(base(), 0, 0, { num: 7, den: 8, groups: [2, 2, 3] })!;
    expect(grouped.bars[0].groups).toEqual([2, 2, 3]);
    expect(relabelBars(grouped, 0, 0, { num: 5 })!.bars[0].groups).toBeUndefined();
    expect(relabelBars(grouped, 0, 0, { den: 4 })!.bars[0].groups).toEqual([2, 2, 3]);
  });

  it("rejects groups that do not add up, a count out of range, or a pulse too short", () => {
    expect(relabelBars(base(), 0, 0, { num: 7, groups: [3, 3] })).toBeNull();
    expect(relabelBars(base(), 0, 0, { num: 0 })).toBeNull();
    expect(relabelBars(base(), 0, 0, { num: 33 })).toBeNull();
    const tight: BarMap = { ...base(), bars: [{ start: 0, num: 4, den: 4 }, { start: 1, num: 4, den: 4 }], end: 2 };
    expect(relabelBars(tight, 0, 0, { num: 32 })).toBeNull();
    expect(relabelBars(base(), 2, 1, { num: 3 })).toBeNull();
  });
});

describe("counting at another pulse", () => {
  it("doubles: 4/4 becomes 8/8 with the same bar lines, and groups are scaled", () => {
    const grouped = relabelBars(base(), 0, 0, { num: 3, den: 4, groups: [3] })!;
    const m = rescalePulse(grouped, 0, 0, 2)!;
    expect(m.bars.map((b) => [b.start, b.num, b.den])).toEqual([[1, 6, 8], [3, 4, 4], [5, 4, 4]]);
    expect(m.bars[0].groups).toEqual([6]);
  });

  it("halves when the count stays whole and the unit is still a note, otherwise refuses", () => {
    expect(rescalePulse(base(), 0, 2, 0.5)!.bars.map((b) => [b.num, b.den])).toEqual([[2, 2], [2, 2], [2, 2]]);
    expect(rescalePulse(relabelBars(base(), 0, 0, { num: 3 })!, 0, 0, 0.5)).toBeNull();
    expect(rescalePulse(base(), 0, 0, 16)).toBeNull();
  });
});

describe("filling a pattern", () => {
  const long = (): BarMap => ({ version: 1, bars: [{ start: 2, num: 4, den: 4 }], end: 26, source: "detected" });

  it("cuts a repeating pattern at a steady pulse over the rest of the song", () => {
    const m = fillCycle(long(), { from: 0, until: null, cycle: [5, 7], den: 8, pulse: 0.25 })!;
    expect(m.bars.slice(0, 4).map((b) => [b.start, b.num])).toEqual([[2, 5], [3.25, 7], [5, 5], [6.25, 7]]);
    expect(validateMap(m)).toBeNull();
    expect(m.bars.every((b) => b.den === 8)).toBe(true);
    expect(m.bars.length).toBe(16);
  });

  it("stops where the bars it keeps begin", () => {
    const m = fillCycle(base(), { from: 0, until: 2, cycle: [2], den: 4, pulse: 0.5 })!;
    expect(m.bars.map((b) => [b.start, b.num])).toEqual([[1, 2], [2, 2], [3, 2], [4, 2], [5, 4]]);
  });

  it("makes a short last bar of what is left over", () => {
    const m = fillCycle({ ...base(), end: 8 }, { from: 2, until: null, cycle: [4], den: 4, pulse: 0.5 })!;
    expect(m.bars.slice(2).map((b) => b.num)).toEqual([4, 2]);
  });

  it("refuses an empty pattern or a range that is backwards", () => {
    expect(fillCycle(base(), { from: 0, until: null, cycle: [], den: 4, pulse: 0.5 })).toBeNull();
    expect(fillCycle(base(), { from: 2, until: 1, cycle: [4], den: 4, pulse: 0.5 })).toBeNull();
    expect(fillCycle(base(), { from: 0, until: null, cycle: [40], den: 4, pulse: 0.5 })).toBeNull();
  });
});

describe("replacing a stretch", () => {
  it("swaps the bars that start in it and lets what was playing at the end carry on", () => {
    const m = replaceBars(base(), 3, 4, [{ start: 3, num: 2, den: 4 }])!;
    expect(m.bars.map((b) => [b.start, b.num])).toEqual([[1, 4], [3, 2], [4, 2], [5, 4]]);
  });

  it("leaves no bar overlapping another", () => {
    const m = replaceBars(base(), 1.5, 4.2, [{ start: 1.5, num: 3, den: 8 }, { start: 3, num: 5, den: 8 }])!;
    expect(validateMap(m)).toBeNull();
    expect(m.bars[0].start).toBe(1);
    expect(m.bars[1].start).toBe(1.5);
  });

  it("refuses an empty replacement", () => {
    expect(replaceBars(base(), 1, 2, [])).toBeNull();
  });
});
