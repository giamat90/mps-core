import { useEffect, useRef, useState } from "react";
import { activeLineIndex, activeWordIndex, lineSeekTime, useLyricsStore } from "../../lyrics";

export interface LyricsSong {
  id: string;
  title: string;
  artist?: string | null;
  officialTitle?: string | null;
  officialArtist?: string | null;
}

export interface LyricsPlayer<S extends LyricsSong> {
  /** The app's player store hook, seen through the two fields the panel reads. */
  use: <T>(select: (state: { song: S | null; currentTime: number }) => T) => T;
  /** Replaces the loaded song when it is still the one that was edited. */
  applySong: (song: S) => void;
  seek: (seconds: number) => void;
}

export interface LyricsPanelOptions<S extends LyricsSong> {
  songId: string;
  player: LyricsPlayer<S>;
  saveIdentity: (songId: string, title: string, artist: string) => Promise<S | null | undefined>;
  cancelSync: () => Promise<unknown>;
  /** False when the song has no vocals stem to sync to; nothing is loaded then. */
  hasVocals?: boolean;
  /** Search under the song's own artist when it has no official one. */
  artistFallback?: boolean;
}

export function useLyricsPanel<S extends LyricsSong>({
  songId,
  player,
  saveIdentity,
  cancelSync,
  hasVocals = true,
  artistFallback = true,
}: LyricsPanelOptions<S>) {
  const lyrics = useLyricsStore((s) => s.lyrics);
  const draft = useLyricsStore((s) => s.draft);
  const status = useLyricsStore((s) => s.status);
  const progress = useLyricsStore((s) => s.progress);
  const stage = useLyricsStore((s) => s.stage);
  const error = useLyricsStore((s) => s.error);
  const notice = useLyricsStore((s) => s.notice);
  const candidates = useLyricsStore((s) => s.candidates);
  const chosen = useLyricsStore((s) => s.chosen);
  const load = useLyricsStore((s) => s.load);
  const clear = useLyricsStore((s) => s.clear);
  const setDraft = useLyricsStore((s) => s.setDraft);
  const searchOnline = useLyricsStore((s) => s.searchOnline);
  const chooseCandidate = useLyricsStore((s) => s.chooseCandidate);
  const sync = useLyricsStore((s) => s.sync);
  const remove = useLyricsStore((s) => s.remove);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const song = player.use((s) => (s.song?.id === songId ? s.song : null));
  const lookupTitle = song?.officialTitle?.trim() || song?.title || "";
  const lookupArtist = song?.officialArtist?.trim() || (artistFallback ? song?.artist : "") || "";
  const [identityOpen, setIdentityOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [artistDraft, setArtistDraft] = useState("");

  const openIdentity = () => {
    setTitleDraft(lookupTitle);
    setArtistDraft(lookupArtist);
    setIdentityOpen(true);
  };

  const submitIdentity = async () => {
    const saved = await saveIdentity(songId, titleDraft, artistDraft);
    if (!saved) return;
    player.applySong(saved);
    setIdentityOpen(false);
  };

  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setIdentityOpen(false);
    if (hasVocals) load(songId);
    return () => clear();
  }, [songId, hasVocals]);

  useEffect(() => {
    if (lyrics) {
      setOpen(true);
      setEditing(false);
    }
  }, [lyrics]);

  // Selectors return the index, not the time, so the list re-renders only when
  // the line or word actually changes rather than 30 times a second.
  const activeLine = player.use((s) => (lyrics ? activeLineIndex(lyrics.lines, s.currentTime) : -1));
  const activeWord = player.use((s) =>
    lyrics && activeLine >= 0 ? activeWordIndex(lyrics.lines[activeLine], s.currentTime) : -1,
  );

  const listRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const list = listRef.current;
    const el = activeLine >= 0 ? lineRefs.current[activeLine] : null;
    if (!list || !el) return;
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeLine]);

  return {
    lyrics,
    draft,
    status,
    progress,
    stage,
    error,
    notice,
    candidates,
    chosen,
    song,
    hasVocals,
    open,
    toggleOpen: () => setOpen((v) => !v),
    editing,
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
    busy: status !== "idle",
    showEditor: !lyrics || editing,
    showAddHint: !(lyrics || status === "loading" || !hasVocals),
    lookupTitle,
    lookupArtist,
    identityOpen,
    titleDraft,
    artistDraft,
    setTitleDraft,
    setArtistDraft,
    openIdentity,
    closeIdentity: () => setIdentityOpen(false),
    saveIdentity: submitIdentity,
    activeLine,
    activeWord,
    listRef,
    setLineRef: (index: number) => (el: HTMLButtonElement | null) => {
      lineRefs.current[index] = el;
    },
    seekToLine: (index: number) => {
      if (lyrics) player.seek(lineSeekTime(lyrics.lines[index]));
    },
    setDraft,
    findOnline: () => searchOnline(songId),
    syncLyrics: () => sync(songId),
    removeLyrics: () => remove(songId),
    chooseCandidate,
    cancelSync: () => cancelSync().catch((e: unknown) => console.error("[LyricsPanel] cancel failed:", e)),
  };
}
