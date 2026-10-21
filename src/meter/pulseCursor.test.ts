import { describe, it, expect } from "vitest";
import { PulseCursor, clickSequence, countInMap } from "./pulseCursor";
import type { BarMap } from "./barMap";

const map: BarMap = {
  version: 1,
  bars: [{ start: 0, num: 4, den: 4 }, { start: 2, num: 7, den: 8, groups: [2, 2, 3] }],
  end: 3.4,
  source: "edited",
};

const drain = (c: PulseCursor) => {
  const out = [];
  for (let k = c.next(); k; k = c.next()) out.push([Math.round(k.time * 100) / 100, k.level]);
  return out;
};

describe("PulseCursor", () => {
  it("walks every pulse with its accent", () => {
    expect(drain(new PulseCursor(map, 0))).toEqual([
      [0, 0], [0.5, 2], [1, 2], [1.5, 2],
      [2, 0], [2.2, 2], [2.4, 1], [2.6, 2], [2.8, 1], [3, 2], [3.2, 2],
    ]);
  });

  it("starts at the first pulse at or after a time, even in the middle of a bar", () => {
    expect(drain(new PulseCursor(map, 1.2))[0]).toEqual([1.5, 2]);
    expect(drain(new PulseCursor(map, 2.4))[0]).toEqual([2.4, 1]);
  });

  it("begins at the first bar when started before it", () => {
    expect(drain(new PulseCursor({ ...map, bars: [{ start: 1, num: 2, den: 4 }], end: 2 }, 0))).toEqual([[1, 0], [1.5, 2]]);
  });

  it("clicks only the groups, or only the bars, when asked", () => {
    expect(drain(new PulseCursor(map, 0, "groups")).map((c) => c[1])).toEqual([0, 0, 1, 1]);
    expect(drain(new PulseCursor(map, 0, "bars"))).toEqual([[0, 0], [2, 0]]);
  });

  it("has nothing to click when started after the song's end", () => {
    expect(new PulseCursor(map, 99).next()).toBeNull();
    expect(new PulseCursor(map, 3.4).next()).toBeNull();
  });

  it("ends when the bars do", () => {
    const c = new PulseCursor(map, 3.3);
    expect(c.next()).toBeNull();
  });
});

describe("clickSequence", () => {
  it("hands the metronome the first click and the waits between the rest", () => {
    const seq = clickSequence(map, 1.2, 1)!;
    expect(seq.first.wait).toBeCloseTo(0.3, 6);
    expect(seq.first.level).toBe(2);
    const second = seq.next()!;
    expect(second.wait).toBeCloseTo(0.5, 6);
    expect(second.level).toBe(0);
    expect(seq.next()!.wait).toBeCloseTo(0.2, 6);
  });

  it("stretches the waits by the playback rate", () => {
    const slow = clickSequence(map, 0, 0.5)!;
    slow.next();
    expect(slow.next()!.wait).toBeCloseTo(1, 6);
  });

  it("is null with nothing left to click or a speed that is not one", () => {
    expect(clickSequence(map, 3.3, 1)).toBeNull();
    expect(clickSequence(map, 0, 0)).toBeNull();
  });

  it("can follow only the groups", () => {
    const seq = clickSequence(map, 2, 1, "groups")!;
    expect(seq.first.level).toBe(0);
    expect(seq.next()!.level).toBe(1);
  });
});

describe("countInMap", () => {
  it("repeats the bar playing at the time, from zero", () => {
    const m = countInMap(map, 2.5, 2)!;
    expect(m.bars.map((b) => [b.num, b.den])).toEqual([[7, 8], [7, 8]]);
    expect(m.bars[0].groups).toEqual([2, 2, 3]);
    expect(m.bars[1].start).toBeCloseTo(1.4, 6);
    expect(m.end).toBeCloseTo(2.8, 6);
  });

  it("uses the first bar before the song starts and the last after it", () => {
    expect(countInMap(map, -1, 1)!.bars[0].num).toBe(4);
    expect(countInMap(map, 99, 1)!.bars[0].num).toBe(7);
  });

  it("is null without bars or without any to count", () => {
    expect(countInMap({ ...map, bars: [] }, 0, 1)).toBeNull();
    expect(countInMap(map, 0, 0)).toBeNull();
  });
});
