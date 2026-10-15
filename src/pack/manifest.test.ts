import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PACK_SCHEMA, PackError, packFiles, parseManifest, parseReference, referenceAt } from "./index";

const fixture = (name: string) => JSON.parse(readFileSync(join(resolve(__dirname, "..", ".."), "fixtures", name), "utf8"));
const clone = () => structuredClone(fixture("pack_manifest.json"));

describe("pack manifest, as the Python writer produces it", () => {
  it("parses the pinned fixture", () => {
    const m = parseManifest(fixture("pack_manifest.json"));
    expect(m.schema).toBe(PACK_SCHEMA);
    expect(m.title).toBe("Practice Song");
    expect(m.durationS).toBe(201.5);
    expect(m.bpm).toBe(96);
    expect(m.tracks.map((t) => t.name)).toEqual(["vocals", "instrumental"]);
    expect(m.variants[0].semitones).toBe(-2);
    expect(m.reference).toEqual({ file: "reference_pitch.json", hopS: 0.02 });
    expect(m.loops).toEqual([{ name: "Chorus", start: 62, end: 94.5 }]);
  });

  it("lists every file the pack must contain, once", () => {
    expect(packFiles(parseManifest(clone()))).toEqual([
      "vocals.m4a",
      "instrumental.m4a",
      "pitched/-2/vocals.m4a",
      "pitched/-2/instrumental.m4a",
      "reference_pitch.json",
      "lyrics.json",
    ]);
  });

  it("accepts a pack with no reference, lyrics, loops or variants", () => {
    const m = clone();
    m.reference = null;
    m.lyrics = null;
    m.loops = [];
    m.variants = [];
    const parsed = parseManifest(m);
    expect(packFiles(parsed)).toEqual(["vocals.m4a", "instrumental.m4a"]);
  });

  it("keeps optional fields null when absent", () => {
    const m = clone();
    delete m.artist;
    delete m.bpm;
    delete m.key;
    delete m.metronomeOffsetS;
    delete m.encoderDelayS;
    const p = parseManifest(m);
    expect([p.artist, p.bpm, p.key, p.metronomeOffsetS, p.encoderDelayS]).toEqual([null, null, null, null, 0]);
  });
});

describe("rules, the same list the writer tests", () => {
  const cases: Array<[string, (m: any) => void, RegExp]> = [
    ["a newer schema asks for an update", (m) => (m.schema = 2), /newer version/],
    ["an unknown schema", (m) => (m.schema = "x"), /Unsupported/],
    ["no duration", (m) => (m.durationS = 0), /durationS/],
    ["rev 0", (m) => (m.rev = 0), /rev/],
    ["a path that leaves the pack", (m) => (m.tracks[0].file = "../x.m4a"), /inside the pack/],
    ["an absolute path", (m) => (m.tracks[0].file = "/abs.m4a"), /relative/],
    ["a drive path", (m) => (m.tracks[0].file = "c:/x.m4a"), /relative/],
    ["a backslash path", (m) => (m.tracks[0].file = "a\\b.m4a"), /relative/],
    ["duplicate track names", (m) => (m.tracks[1].name = "vocals"), /unique/],
    ["a VPS pack without the instrumental", (m) => (m.tracks = [m.tracks[0]]), /instrumental/],
    ["variant 0", (m) => (m.variants[0].semitones = 0), /semitones/],
    ["a repeated variant", (m) => m.variants.push(structuredClone(m.variants[0])), /semitones/],
    ["a variant with fewer tracks", (m) => m.variants[0].tracks.pop(), /same tracks/],
    ["a loop past the end", (m) => (m.loops[0].end = 999), /inside the song/],
    ["an unnamed loop", (m) => (m.loops[0].name = " "), /name/],
    ["a reference with no hop", (m) => (m.reference.hopS = 0), /hopS/],
    ["an encoder delay of two seconds", (m) => (m.encoderDelayS = 2), /encoderDelayS/],
  ];
  it.each(cases)("rejects %s", (_name, mutate, message) => {
    const m = clone();
    mutate(m);
    expect(() => parseManifest(m)).toThrow(PackError);
    expect(() => parseManifest(m)).toThrow(message);
  });

  it("rejects things that are not manifests", () => {
    for (const v of [null, 3, "x", [], undefined]) expect(() => parseManifest(v)).toThrow(PackError);
  });
});

describe("reference pitch", () => {
  const ref = parseReference(fixture("pack_reference.json"));

  it("parses the pinned fixture and answers by song time", () => {
    expect(ref.hopS).toBe(0.02);
    expect(ref.f0.length).toBeGreaterThan(100);
    expect(referenceAt(ref, 0)).toBe(220);
    expect(referenceAt(ref, -1)).toBeNull();
    expect(referenceAt(ref, 9999)).toBeNull();
  });

  it("returns null for an unvoiced frame", () => {
    const small = { hopS: 0.02, durationS: 0.1, f0: [220, 0, 440] };
    expect(referenceAt(small, 0.025)).toBeNull();
    expect(referenceAt(small, 0.045)).toBe(440);
  });

  it("refuses anything that is not a pitch line", () => {
    expect(() => parseReference({ hopS: 0.02, durationS: 1, f0: [1, "a"] })).toThrow(PackError);
    expect(() => parseReference({ hopS: 0, durationS: 1, f0: [] })).toThrow(PackError);
    expect(() => parseReference({ hopS: 0.02, durationS: 1, f0: [-5] })).toThrow(PackError);
  });
});
