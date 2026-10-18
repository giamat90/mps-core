import { describe, it, expect } from "vitest";
import { createSongFilter, normalizeForSearch, type SearchableSong } from "./librarySearch";

interface Song extends SearchableSong {
  artist?: string;
  kind?: string;
}

const song = (id: string, title: string, extra: Partial<Song> = {}): Song => ({ id, title, ...extra });
const folders = [{ id: "f1", name: "Beatles" }];
const filter = createSongFilter<Song>({
  extraTerms: (s) => [s.artist ?? "", ...(s.kind === "instrument" ? ["instrument"] : [])],
});
const plainFilter = createSongFilter<Song>();

describe("normalizeForSearch", () => {
  it("lowers case, drops accents and collapses spaces", () => {
    expect(normalizeForSearch("  Café   DEL  Mar ")).toBe("cafe del mar");
  });
});

describe("filterSongs", () => {
  const songs = [
    song("a", "Yesterday", { artist: "The Beatles", detectedKey: "F major", detectedBpm: 96.4, folderId: "f1" }),
    song("b", "Piano scale", { kind: "instrument" }),
    song("c", "Café song"),
  ];

  it("returns the songs unchanged for an empty query", () => {
    expect(filter(songs, folders, "  ")).toBe(songs);
  });

  it("needs every word and ignores case and accents", () => {
    expect(filter(songs, folders, "CAFE").map((s) => s.id)).toEqual(["c"]);
    expect(filter(songs, folders, "yesterday f major").map((s) => s.id)).toEqual(["a"]);
    expect(filter(songs, folders, "yesterday piano")).toEqual([]);
  });

  it("finds a song by its tempo and by its folder", () => {
    expect(filter(songs, folders, "96 bpm").map((s) => s.id)).toEqual(["a"]);
    expect(filter(songs, folders, "beatles").map((s) => s.id)).toEqual(["a"]);
  });

  it("searches only the extra terms an app asks for", () => {
    expect(filter(songs, folders, "instrument").map((s) => s.id)).toEqual(["b"]);
    expect(plainFilter(songs, folders, "instrument")).toEqual([]);
    expect(plainFilter(songs, [], "the beatles")).toEqual([]);
  });

  it("keeps the order it was given", () => {
    expect(filter([songs[2], songs[0]], folders, "e").map((s) => s.id)).toEqual(["c", "a"]);
  });
});
