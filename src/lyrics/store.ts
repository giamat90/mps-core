import { create } from "zustand";
import { deleteLyrics, findLyrics, loadLyrics, onLyricsProgress, searchLyrics, syncLyrics } from "./ipc";
import type { FoundLyrics, Lyrics, LyricsCandidate } from "./types";

type Status = "idle" | "loading" | "finding" | "syncing";
type DraftSource = "paste" | "lrclib";

interface LyricsState {
  songId: string | null;
  lyrics: Lyrics | null;
  /** The text box: what the next sync will align */
  draft: string;
  draftSource: DraftSource;
  status: Status;
  progress: number;
  stage: string;
  error: string | null;
  notice: string | null;
  /** Results of the last online search, best first; empty when none was run */
  candidates: LyricsCandidate[];
  /** Index into `candidates` of the one now in the draft, or -1 */
  chosen: number;

  load: (songId: string) => Promise<void>;
  setDraft: (text: string) => void;
  findOnline: (songId: string) => Promise<void>;
  /** Search online: fill the draft with the best match and keep the rest to choose from */
  searchOnline: (songId: string) => Promise<void>;
  /** Put one of the search results in the draft */
  chooseCandidate: (index: number) => void;
  sync: (songId: string) => Promise<void>;
  remove: (songId: string) => Promise<void>;
  clear: () => void;
}

const EMPTY = {
  songId: null,
  lyrics: null,
  draft: "",
  draftSource: "paste" as DraftSource,
  status: "idle" as Status,
  progress: 0,
  stage: "",
  error: null,
  notice: null,
  candidates: [] as LyricsCandidate[],
  chosen: -1,
};

function describe(found: FoundLyrics): string {
  return `${found.title}${found.artist ? ` by ${found.artist}` : ""}`;
}

function foundNotice(found: FoundLyrics): string {
  return found.synced
    ? `Found "${describe(found)}". Review the text, then sync.`
    : `Found "${describe(found)}" as plain text. Check that every repeated chorus is written out in full, then sync.`;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  ...EMPTY,

  load: async (songId) => {
    set({ ...EMPTY, songId, status: "loading" });
    try {
      const lyrics = await loadLyrics(songId);
      if (get().songId !== songId) return;
      set({ lyrics, draft: lyrics?.text ?? "", status: "idle" });
    } catch (e) {
      console.warn("[lyrics] Could not load lyrics:", e);
      if (get().songId !== songId) return;
      set({ error: message(e), status: "idle" });
    }
  },

  setDraft: (text) => set({ draft: text, error: null, notice: null, chosen: -1 }),

  findOnline: async (songId) => {
    set({ status: "finding", error: null, notice: null });
    try {
      const found = await findLyrics(songId);
      if (get().songId !== songId) return;
      set({ draft: found.text, draftSource: "lrclib", status: "idle", notice: foundNotice(found) });
    } catch (e) {
      console.error("[lyrics] Lookup failed:", e);
      if (get().songId !== songId) return;
      set({ status: "idle", error: message(e) });
    }
  },

  searchOnline: async (songId) => {
    set({ status: "finding", error: null, notice: null, candidates: [], chosen: -1 });
    try {
      const { candidates } = await searchLyrics(songId);
      if (get().songId !== songId) return;
      const best = candidates[0];
      if (!best || best.lengthMismatch) {
        set({
          candidates,
          status: "idle",
          notice: "No result matches this song's length. Choose the one that is your version, or paste the lyrics.",
        });
        return;
      }
      set({
        candidates,
        chosen: 0,
        draft: best.text,
        draftSource: "lrclib",
        status: "idle",
        notice: candidates.length > 1 ? `${foundNotice(best)} ${candidates.length - 1} other result(s) below.` : foundNotice(best),
      });
    } catch (e) {
      console.error("[lyrics] Search failed:", e);
      if (get().songId !== songId) return;
      set({ status: "idle", error: message(e) });
    }
  },

  chooseCandidate: (index) => {
    const picked = get().candidates[index];
    if (!picked) return;
    set({ draft: picked.text, draftSource: "lrclib", chosen: index, error: null, notice: foundNotice(picked) });
  },

  sync: async (songId) => {
    const { draft, draftSource, status } = get();
    if (status === "syncing") return;
    if (!draft.trim()) {
      set({ error: "Paste the lyrics first." });
      return;
    }
    set({ status: "syncing", progress: 0, stage: "Starting", error: null, notice: null });

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await onLyricsProgress((p) => {
        if (p.songId === songId) set({ progress: p.progress, stage: p.stage });
      });
    } catch (e) {
      console.warn("[lyrics] Progress updates unavailable:", e);
    }

    try {
      const lyrics = await syncLyrics(songId, draft, draftSource);
      if (get().songId !== songId) return;
      set({ lyrics, status: "idle", progress: 1 });
    } catch (e) {
      console.error("[lyrics] Sync failed:", e);
      if (get().songId !== songId) return;
      set({ status: "idle", error: message(e) });
    } finally {
      unlisten?.();
    }
  },

  remove: async (songId) => {
    try {
      await deleteLyrics(songId);
      if (get().songId !== songId) return;
      set({ lyrics: null, error: null, notice: null });
    } catch (e) {
      console.error("[lyrics] Could not delete lyrics:", e);
      if (get().songId !== songId) return;
      set({ error: message(e) });
    }
  },

  clear: () => set({ ...EMPTY }),
}));
