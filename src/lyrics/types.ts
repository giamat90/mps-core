/** One word of a lyric line, timed against the song (seconds) */
export interface LyricWord {
  text: string;
  start: number;
  end: number;
  /** Alignment confidence 0..1; 0 for words the model could not place */
  score: number;
}

export interface LyricLine {
  text: string;
  start: number;
  end: number;
  score: number;
  words: LyricWord[];
}

/** A song's lyrics aligned to its vocals stem (stored as `lyrics.json`) */
export interface Lyrics {
  version: number;
  source: "paste" | "lrclib";
  /** The text exactly as supplied, kept for editing and re-syncing */
  text: string;
  aligner: string;
  alignedAt: string;
  meanScore: number;
  /** Set when the text probably does not fit the recording */
  warning?: string | null;
  lines: LyricLine[];
}

/** Lyrics found online, for the user to review before syncing */
export interface FoundLyrics {
  text: string;
  synced: boolean;
  title: string;
  artist: string;
  source: string;
}

export interface LyricsProgress {
  songId: string;
  progress: number;
  stage: string;
}
