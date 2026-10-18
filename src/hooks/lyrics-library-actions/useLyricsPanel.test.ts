// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { useLyricsStore } from "../../lyrics";
import type { Lyrics } from "../../lyrics";
import { useLyricsPanel, type LyricsPanelOptions, type LyricsPlayer, type LyricsSong } from "./useLyricsPanel";

type Song = LyricsSong;

const lyrics: Lyrics = {
  version: 1,
  source: "paste",
  text: "one\ntwo",
  aligner: "x",
  alignedAt: "now",
  meanScore: 1,
  lines: [
    { text: "one", start: 1, end: 2, score: 1, words: [{ text: "one", start: 1, end: 2, score: 1 }] },
    {
      text: "two",
      start: 3,
      end: 5,
      score: 1,
      words: [
        { text: "tw", start: 3, end: 4, score: 1 },
        { text: "o", start: 4, end: 5, score: 1 },
      ],
    },
  ],
};

const state = { song: { id: "s1", title: "Title", artist: "Artist" } as Song | null, currentTime: 0 };
const applySong = vi.fn();
const seek = vi.fn();
const player: LyricsPlayer<Song> = { use: (select) => select(state), applySong, seek };

const actions = {
  load: vi.fn(async () => {}),
  clear: vi.fn(),
  searchOnline: vi.fn(async () => {}),
  sync: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  chooseCandidate: vi.fn(),
};

function options(extra: Partial<LyricsPanelOptions<Song>> = {}): LyricsPanelOptions<Song> {
  return { songId: "s1", player, saveIdentity: vi.fn(async () => null), cancelSync: vi.fn(async () => {}), ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.song = { id: "s1", title: "Title", artist: "Artist" };
  state.currentTime = 0;
  useLyricsStore.setState({
    ...actions,
    lyrics: null,
    draft: "",
    status: "idle",
    candidates: [],
    chosen: -1,
    error: null,
    notice: null,
  } as never);
});

describe("loading", () => {
  it("loads the song's lyrics on mount and clears them on unmount", () => {
    const { unmount } = renderHook(() => useLyricsPanel(options()));
    expect(actions.load).toHaveBeenCalledWith("s1");
    unmount();
    expect(actions.clear).toHaveBeenCalled();
  });

  it("loads nothing for a song without a vocals stem, but still clears", () => {
    const { result, unmount } = renderHook(() => useLyricsPanel(options({ hasVocals: false })));
    expect(actions.load).not.toHaveBeenCalled();
    expect(result.current.showAddHint).toBe(false);
    unmount();
    expect(actions.clear).toHaveBeenCalled();
  });

  it("reloads when the song changes", () => {
    const { rerender } = renderHook((p: { id: string }) => useLyricsPanel(options({ songId: p.id })), {
      initialProps: { id: "s1" },
    });
    rerender({ id: "s2" });
    expect(actions.load).toHaveBeenLastCalledWith("s2");
  });
});

describe("open and editing", () => {
  it("starts closed and toggles", () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    expect(result.current.open).toBe(false);
    act(() => result.current.toggleOpen());
    expect(result.current.open).toBe(true);
  });

  it("opens by itself when lyrics arrive and leaves edit mode", () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    act(() => result.current.startEditing());
    act(() => useLyricsStore.setState({ lyrics }));
    expect(result.current.open).toBe(true);
    expect(result.current.editing).toBe(false);
  });

  it("shows the editor without lyrics or while editing, and the add hint only when idle without lyrics", () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    expect(result.current.showEditor).toBe(true);
    expect(result.current.showAddHint).toBe(true);
    act(() => useLyricsStore.setState({ status: "loading" }));
    expect(result.current.showAddHint).toBe(false);
    expect(result.current.busy).toBe(true);
    act(() => useLyricsStore.setState({ lyrics, status: "idle" }));
    expect(result.current.showEditor).toBe(false);
    act(() => result.current.startEditing());
    expect(result.current.showEditor).toBe(true);
    act(() => result.current.stopEditing());
    expect(result.current.showEditor).toBe(false);
  });
});

describe("lookup identity", () => {
  it("prefers the official title and artist, trimmed", () => {
    state.song = { id: "s1", title: "Title", artist: "Artist", officialTitle: " Real ", officialArtist: " Band " };
    const { result } = renderHook(() => useLyricsPanel(options()));
    expect([result.current.lookupTitle, result.current.lookupArtist]).toEqual(["Real", "Band"]);
  });

  it("falls back to the song's artist unless told not to", () => {
    expect(renderHook(() => useLyricsPanel(options())).result.current.lookupArtist).toBe("Artist");
    expect(renderHook(() => useLyricsPanel(options({ artistFallback: false }))).result.current.lookupArtist).toBe("");
  });

  it("ignores a song that is not the one shown", () => {
    state.song = { id: "other", title: "X" };
    const { result } = renderHook(() => useLyricsPanel(options()));
    expect(result.current.song).toBeNull();
    expect(result.current.lookupTitle).toBe("");
  });

  it("opens the form with the current values, saves, applies the saved song and closes", async () => {
    const saved: Song = { id: "s1", title: "Title", officialTitle: "New", officialArtist: "Who" };
    const opts = options({ saveIdentity: vi.fn(async () => saved) });
    const { result } = renderHook(() => useLyricsPanel(opts));
    act(() => result.current.openIdentity());
    expect(result.current.identityOpen).toBe(true);
    expect([result.current.titleDraft, result.current.artistDraft]).toEqual(["Title", "Artist"]);
    act(() => {
      result.current.setTitleDraft("New");
      result.current.setArtistDraft("Who");
    });
    await act(async () => result.current.saveIdentity());
    expect(opts.saveIdentity).toHaveBeenCalledWith("s1", "New", "Who");
    expect(applySong).toHaveBeenCalledWith(saved);
    expect(result.current.identityOpen).toBe(false);
  });

  it("keeps the form open when saving fails", async () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    act(() => result.current.openIdentity());
    await act(async () => result.current.saveIdentity());
    expect(applySong).not.toHaveBeenCalled();
    expect(result.current.identityOpen).toBe(true);
    act(() => result.current.closeIdentity());
    expect(result.current.identityOpen).toBe(false);
  });
});

describe("following the song", () => {
  beforeEach(() => useLyricsStore.setState({ lyrics }));

  it("tracks the active line and word, and -1 before the first line", () => {
    const { result, rerender } = renderHook(() => useLyricsPanel(options()));
    expect([result.current.activeLine, result.current.activeWord]).toEqual([-1, -1]);
    state.currentTime = 4.2;
    rerender();
    expect([result.current.activeLine, result.current.activeWord]).toEqual([1, 1]);
  });

  it("seeks to a line with the lead-in, and to nothing without lyrics", () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    result.current.seekToLine(1);
    expect(seek).toHaveBeenCalledWith(2.7);
    act(() => useLyricsStore.setState({ lyrics: null }));
    result.current.seekToLine(0);
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("scrolls the list so the active line is centred", () => {
    const { result, rerender } = renderHook(() => useLyricsPanel(options()));
    const scrollTo = vi.fn();
    const list = { clientHeight: 100, scrollTo } as unknown as HTMLDivElement;
    (result.current.listRef as { current: HTMLDivElement | null }).current = list;
    result.current.setLineRef(1)({ offsetTop: 300, clientHeight: 20 } as HTMLButtonElement);
    state.currentTime = 3.5;
    rerender();
    expect(scrollTo).toHaveBeenCalledWith({ top: 260, behavior: "smooth" });
  });

  it("does not scroll when the list or line is not mounted", () => {
    const { rerender } = renderHook(() => useLyricsPanel(options()));
    state.currentTime = 3.5;
    expect(() => rerender()).not.toThrow();
  });
});

describe("actions", () => {
  it("passes the song id to find, sync and remove", () => {
    const { result } = renderHook(() => useLyricsPanel(options()));
    result.current.findOnline();
    result.current.syncLyrics();
    result.current.removeLyrics();
    expect(actions.searchOnline).toHaveBeenCalledWith("s1");
    expect(actions.sync).toHaveBeenCalledWith("s1");
    expect(actions.remove).toHaveBeenCalledWith("s1");
  });

  it("logs a failed cancel instead of swallowing it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cancelSync = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useLyricsPanel(options({ cancelSync })));
    await act(async () => result.current.cancelSync());
    expect(error).toHaveBeenCalledWith("[LyricsPanel] cancel failed:", expect.any(Error));
  });
});
