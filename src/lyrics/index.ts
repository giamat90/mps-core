export type { FoundLyrics, LyricLine, LyricWord, Lyrics, LyricsProgress } from "./types";
export {
  LINE_HOLD_S,
  LINE_LEAD_IN_S,
  activeLineIndex,
  activeWordIndex,
  lineSeekTime,
  lyricsPlainText,
} from "./timing";
export { deleteLyrics, findLyrics, loadLyrics, onLyricsProgress, syncLyrics } from "./ipc";
export { useLyricsStore } from "./store";
