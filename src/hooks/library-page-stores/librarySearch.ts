import type { FolderLike, SongLike } from "./libraryStore";

/** Lower case, accents removed, runs of spaces collapsed: what two spellings of a name have in common. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchableSong extends SongLike {
  title: string;
  detectedKey?: string;
  detectedBpm?: number;
}

export interface SongFilterOptions<Song> {
  /** Fields an app searches in addition to title, key, tempo and folder (VPS: artist and "instrument"). */
  extraTerms?: (song: Song) => string[];
}

/** `filterSongs(songs, folders, query)`: the songs containing every word of `query`, in the order given. */
export function createSongFilter<Song extends SearchableSong>({ extraTerms }: SongFilterOptions<Song> = {}) {
  const haystack = (song: Song, folderName: string | undefined): string => {
    const parts = [song.title, song.detectedKey ?? "", folderName ?? "", ...(extraTerms?.(song) ?? [])];
    if (song.detectedBpm) parts.push(`${Math.round(song.detectedBpm)} bpm`);
    return normalizeForSearch(parts.join(" "));
  };

  return (songs: Song[], folders: Array<FolderLike & { name: string }>, query: string): Song[] => {
    const words = normalizeForSearch(query).split(" ").filter(Boolean);
    if (words.length === 0) return songs;
    const folderNames = new Map(folders.map((f) => [f.id, f.name]));
    return songs.filter((song) => {
      const text = haystack(song, song.folderId ? folderNames.get(song.folderId) : undefined);
      return words.every((w) => text.includes(w));
    });
  };
}
