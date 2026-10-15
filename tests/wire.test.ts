// Python <-> TypeScript agreement. python/tests/test_wire_fixture.py pins what
// the sidecar really returns; this reads the same files and checks that the
// TypeScript types and the karaoke timing code are written for exactly that.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { activeLineIndex, activeWordIndex, lineSeekTime } from "../src/lyrics/timing";
import type { FoundLyrics, LyricLine, LyricWord, Lyrics, LyricsCandidate } from "../src/lyrics/types";

const fixture = (name: string) => JSON.parse(readFileSync(join(resolve(__dirname, ".."), "fixtures", name), "utf8"));

// `Record<keyof T, true>` makes this file fail to compile when an interface
// gains or loses a field, so the lists below cannot silently go stale.
const WORD_KEYS: Record<keyof LyricWord, true> = { text: true, start: true, end: true, score: true };
const LINE_KEYS: Record<keyof LyricLine, true> = { text: true, start: true, end: true, score: true, words: true };
const FOUND_KEYS: Record<keyof FoundLyrics, true> = { text: true, synced: true, title: true, artist: true, source: true };
const CANDIDATE_KEYS: Record<keyof LyricsCandidate, true> = {
  ...FOUND_KEYS,
  duration: true,
  lengthMismatch: true,
};
// Fields the shell adds when it persists an alignment as `lyrics.json`.
const PERSISTED_BY_SHELL: (keyof Lyrics)[] = ["version", "source", "text", "alignedAt"];

const sorted = (o: object) => Object.keys(o).sort();

describe("sidecar align_lyrics reply", () => {
  const reply = fixture("align_result.json") as {
    aligner: string;
    meanScore: number;
    warning: string | null;
    lines: LyricLine[];
  };

  it("carries every Lyrics field the sidecar is responsible for", () => {
    const lyricsKeys = new Set<string>(["aligner", "meanScore", "warning", "lines"]);
    const known = new Set<string>([...PERSISTED_BY_SHELL, ...lyricsKeys]);
    const typeKeys: Record<keyof Lyrics, true> = {
      version: true, source: true, text: true, aligner: true, alignedAt: true, meanScore: true, warning: true, lines: true,
    };
    expect(sorted(typeKeys)).toEqual([...known].sort());
    for (const key of lyricsKeys) expect(reply).toHaveProperty(key);
  });

  it("lines and words have exactly the fields the TypeScript types declare", () => {
    expect(reply.lines.length).toBeGreaterThan(0);
    for (const line of reply.lines) {
      expect(sorted(line)).toEqual(sorted(LINE_KEYS));
      for (const word of line.words) expect(sorted(word)).toEqual(sorted(WORD_KEYS));
    }
  });

  it("times are seconds, in order, and every word sits inside its line", () => {
    let previousEnd = -Infinity;
    for (const line of reply.lines) {
      expect(line.start).toBeLessThanOrEqual(line.end);
      expect(line.start).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = line.end;
      for (const w of line.words) {
        expect(w.start).toBeGreaterThanOrEqual(line.start);
        expect(w.end).toBeLessThanOrEqual(line.end);
      }
    }
  });

  it("drives the karaoke timing code: every line is found at its own start, every word within it", () => {
    reply.lines.forEach((line, i) => {
      expect(activeLineIndex(reply.lines, line.start)).toBe(i);
      expect(lineSeekTime(line)).toBeLessThanOrEqual(line.start);
      expect(activeLineIndex(reply.lines, lineSeekTime(line))).toBe(i);
      line.words.forEach((word, w) => expect(activeWordIndex(line, word.start)).toBe(w));
    });
  });
});

describe("sidecar find_lyrics reply", () => {
  const reply = fixture("find_result.json") as Record<string, unknown>;

  it("contains every field of FoundLyrics", () => {
    for (const key of Object.keys(FOUND_KEYS)) expect(reply).toHaveProperty(key);
  });

  it("uses the types the store reads", () => {
    expect(typeof reply.text).toBe("string");
    expect(typeof reply.synced).toBe("boolean");
    expect(typeof reply.title).toBe("string");
    expect(typeof reply.artist).toBe("string");
  });
});

describe("sidecar search_lyrics reply", () => {
  const reply = fixture("search_result.json") as { query: string; candidates: Record<string, unknown>[] };

  it("has the query and a list of candidates", () => {
    expect(typeof reply.query).toBe("string");
    expect(reply.candidates.length).toBeGreaterThan(0);
  });

  it("gives every candidate exactly the fields LyricsCandidate declares", () => {
    for (const c of reply.candidates) expect(sorted(c)).toEqual(sorted(CANDIDATE_KEYS));
  });

  it("uses the types the store reads, with the wrong-length entries flagged", () => {
    for (const c of reply.candidates) {
      expect(typeof c.text).toBe("string");
      expect(typeof c.synced).toBe("boolean");
      expect(typeof c.lengthMismatch).toBe("boolean");
      expect(c.duration === null || typeof c.duration === "number").toBe(true);
    }
    expect(reply.candidates.some((c) => c.lengthMismatch === true)).toBe(true);
    expect(reply.candidates[0].lengthMismatch).toBe(false);
  });
});
