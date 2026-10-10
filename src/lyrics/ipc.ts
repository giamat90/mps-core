import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FoundLyrics, Lyrics, LyricsProgress } from "./types";

// Command names and argument keys here are a contract with each app's
// src-tauri: the apps' IPC contract test reads this file and checks it against
// their Rust handlers, so keep each wrapper a single `return invoke(...)`.

/** Saved lyrics for a song, or null when it has none yet */
export async function loadLyrics(songId: string): Promise<Lyrics | null> {
  return invoke<Lyrics | null>("load_lyrics", { songId });
}

/** Align lyric text to the song's vocals stem (first run downloads the model) */
export async function syncLyrics(songId: string, text: string, source?: "paste" | "lrclib"): Promise<Lyrics> {
  return invoke<Lyrics>("sync_lyrics", { songId, text, source });
}

/** Look the song's lyrics up online; returns text for review, nothing is saved */
export async function findLyrics(songId: string): Promise<FoundLyrics> {
  return invoke<FoundLyrics>("find_lyrics", { songId });
}

export async function deleteLyrics(songId: string): Promise<void> {
  return invoke("delete_lyrics", { songId });
}

/** Listen for lyrics-sync progress events */
export function onLyricsProgress(callback: (progress: LyricsProgress) => void): Promise<UnlistenFn> {
  return listen<LyricsProgress>("lyrics-progress", (event) => {
    callback(event.payload);
  });
}
