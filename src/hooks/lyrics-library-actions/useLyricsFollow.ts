import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mps_lyrics_follow";

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch (e) {
    console.warn(`[lyrics] Could not load ${STORAGE_KEY}:`, e);
    return true;
  }
}

/**
 * Whether the lyrics follow the song (the line being sung is lit and the list
 * scrolls to it). On by default; the choice is kept for every song. A lyrics
 * panel in a window of its own is another webview on the same storage, so the
 * value is re-read when that window writes.
 */
export function useLyricsFollow(): [boolean, (follow: boolean) => void] {
  const [follow, setFollowState] = useState(load);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setFollowState(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setFollow = useCallback((next: boolean) => {
    setFollowState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch (e) {
      console.warn(`[lyrics] Could not persist ${STORAGE_KEY}:`, e);
    }
  }, []);

  return [follow, setFollow];
}
