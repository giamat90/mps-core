import { describe, it, expect } from "vitest";
import {
  addLoop, barSections, barSectionsFromMap, MAX_LOOPS, MAX_LOOP_NAME, removeLoop, renameLoop, validateLoop, type NamedLoop,
} from "./loops";

const loop = (id: string, start: number, end: number, name = id): NamedLoop => ({ id, name, start, end });

describe("validateLoop", () => {
  it("accepts a named region with a positive length", () => {
    expect(validateLoop("Chorus", 10, 20, 100)).toBeNull();
  });

  it("rejects an empty or blank name", () => {
    expect(validateLoop("", 10, 20, 100)).toMatch(/name/i);
    expect(validateLoop("   ", 10, 20, 100)).toMatch(/name/i);
  });

  it("rejects a name that is too long", () => {
    expect(validateLoop("x".repeat(MAX_LOOP_NAME + 1), 10, 20, 100)).toMatch(/name/i);
  });

  it("rejects a region that is not forward, finite or long enough", () => {
    expect(validateLoop("a", 20, 10, 100)).toMatch(/region/i);
    expect(validateLoop("a", 10, 10.1, 100)).toMatch(/region/i);
    expect(validateLoop("a", Number.NaN, 10, 100)).toMatch(/region/i);
    expect(validateLoop("a", -1, 10, 100)).toMatch(/region/i);
  });

  it("rejects a region past the end of the song", () => {
    expect(validateLoop("a", 90, 110, 100)).toMatch(/region/i);
  });

  it("does not check the end of the song when the duration is unknown", () => {
    expect(validateLoop("a", 90, 110, 0)).toBeNull();
  });
});

describe("addLoop", () => {
  it("adds the loop with a trimmed name, keeping the list in time order", () => {
    const list = addLoop([loop("a", 30, 40)], { id: "b", name: "  Verse  ", start: 5, end: 15 }, 100);
    expect(list.map((l) => l.id)).toEqual(["b", "a"]);
    expect(list[0].name).toBe("Verse");
  });

  it("does not change the list it was given", () => {
    const before = [loop("a", 30, 40)];
    addLoop(before, { id: "b", name: "B", start: 1, end: 5 }, 100);
    expect(before).toHaveLength(1);
  });

  it("throws the validation message for a bad loop", () => {
    expect(() => addLoop([], { id: "a", name: "", start: 1, end: 5 }, 100)).toThrow(/name/i);
  });

  it("refuses to grow past the limit", () => {
    const full = Array.from({ length: MAX_LOOPS }, (_, i) => loop(`l${i}`, i, i + 1));
    expect(() => addLoop(full, { id: "x", name: "x", start: 0.5, end: 3 }, 1000)).toThrow(/too many/i);
  });

  it("refuses an id that is already used", () => {
    expect(() => addLoop([loop("a", 1, 5)], { id: "a", name: "A2", start: 6, end: 9 }, 100)).toThrow(/id/i);
  });
});

describe("renameLoop / removeLoop", () => {
  const list = [loop("a", 1, 5), loop("b", 6, 9)];

  it("renames one loop and trims the name", () => {
    expect(renameLoop(list, "b", "  Outro ").map((l) => l.name)).toEqual(["a", "Outro"]);
  });

  it("rejects a blank new name and keeps the old one", () => {
    expect(() => renameLoop(list, "b", " ")).toThrow(/name/i);
  });

  it("returns the list unchanged for an unknown id", () => {
    expect(renameLoop(list, "zzz", "X")).toEqual(list);
    expect(removeLoop(list, "zzz")).toEqual(list);
  });

  it("removes one loop", () => {
    expect(removeLoop(list, "a").map((l) => l.id)).toEqual(["b"]);
  });
});

describe("barSections", () => {
  const base = { duration: 60, bpm: 120, beatsPerBar: 4, offset: 0, barsPerSection: 4 };

  it("groups bars from the downbeat, a bar being four beats", () => {
    const sections = barSections(base);
    expect(sections[0]).toEqual({ start: 0, end: 8, label: "Bars 1–4" });
    expect(sections[1]).toEqual({ start: 8, end: 16, label: "Bars 5–8" });
  });

  it("ends the last section at the end of the song", () => {
    const sections = barSections(base);
    expect(sections[sections.length - 1].end).toBe(60);
  });

  it("folds a leftover shorter than a bar into the section before", () => {
    const sections = barSections({ ...base, duration: 16.5 });
    expect(sections).toHaveLength(2);
    expect(sections[1].end).toBe(16.5);
  });

  it("keeps a leftover of a bar or more as a section of its own", () => {
    const sections = barSections({ ...base, duration: 18 });
    expect(sections).toHaveLength(3);
    expect(sections[2]).toEqual({ start: 16, end: 18, label: "Bars 9" });
  });

  it("starts numbering at the downbeat and names what comes before it the intro", () => {
    const sections = barSections({ ...base, offset: 3 });
    expect(sections[0]).toEqual({ start: 0, end: 3, label: "Intro" });
    expect(sections[1]).toEqual({ start: 3, end: 11, label: "Bars 1–4" });
  });

  it("ignores an offset of under a second instead of making a tiny intro", () => {
    const sections = barSections({ ...base, offset: 0.4 });
    expect(sections[0].label).toBe("Bars 1–4");
    expect(sections[0].start).toBe(0.4);
  });

  it("follows the section size", () => {
    expect(barSections({ ...base, barsPerSection: 8 })[0].end).toBe(16);
    expect(barSections({ ...base, barsPerSection: 2 })[0]).toEqual({ start: 0, end: 4, label: "Bars 1–2" });
  });

  it("returns nothing without a usable tempo or duration", () => {
    expect(barSections({ ...base, bpm: 0 })).toEqual([]);
    expect(barSections({ ...base, duration: 0 })).toEqual([]);
    expect(barSections({ ...base, barsPerSection: 0 })).toEqual([]);
  });
});

describe("barSectionsFromMap", () => {
  const bar = (start: number, num = 4, den = 4) => ({ start, num, den });
  const map = (starts: number[], end: number) => ({ version: 1 as const, bars: starts.map((s) => bar(s)), end, source: "edited" as const });

  it("groups the bars of the map, however long each is", () => {
    const sections = barSectionsFromMap(map([0, 2, 5, 6, 9, 10], 12), 2);
    expect(sections).toEqual([
      { start: 0, end: 5, label: "Bars 1–2" },
      { start: 5, end: 9, label: "Bars 3–4" },
      { start: 9, end: 12, label: "Bars 5–6" },
    ]);
  });

  it("starts with an intro when the first bar comes late", () => {
    expect(barSectionsFromMap(map([4, 6], 8), 2)).toEqual([
      { start: 0, end: 4, label: "Intro" },
      { start: 4, end: 8, label: "Bars 1–2" },
    ]);
  });

  it("names a last section of one bar after that bar", () => {
    expect(barSectionsFromMap(map([0, 2, 4], 6), 2).map((s) => s.label)).toEqual(["Bars 1–2", "Bars 3"]);
  });

  it("is empty without bars or a section size", () => {
    expect(barSectionsFromMap({ ...map([0], 2), bars: [] }, 4)).toEqual([]);
    expect(barSectionsFromMap(map([0], 2), 0)).toEqual([]);
  });
});
