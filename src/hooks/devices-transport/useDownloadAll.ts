import { useState } from "react";
import type { StoreHook } from "./storeHook";

export interface ZipEntry {
  path: string;
  archiveName: string;
}

export interface TakeFile {
  name?: string;
  filepath: string;
}

/** The song folder with forward slashes, as the archive paths are built. */
export function songDirectory(song: { directory: string }): string {
  return song.directory.replace(/\\/g, "/");
}

/** `entries` followed by the takes, named after the take or `Take n`, with ` (2)` and so on to keep archive names unique. */
export function addTakeEntries(entries: ZipEntry[], takes: readonly TakeFile[]): ZipEntry[] {
  const out = [...entries];
  const used = new Set(out.map((e) => e.archiveName));
  takes.forEach((take, i) => {
    const base = take.name || `Take ${i + 1}`;
    let archiveName = `${base}.wav`;
    let n = 2;
    while (used.has(archiveName)) {
      archiveName = `${base} (${n++}).wav`;
    }
    used.add(archiveName);
    out.push({ path: take.filepath, archiveName });
  });
  return out;
}

export interface DownloadAllOptions<Song extends { directory: string; title: string }> {
  store: StoreHook<{ takes: readonly TakeFile[] }>;
  song: Song;
  /** The tracks of the song itself, as zip entries; the takes are added after them. */
  trackEntries: (song: Song, directory: string) => ZipEntry[];
  exportAll: (entries: ZipEntry[], suggestedName: string) => Promise<unknown>;
}

export interface DownloadAll {
  isExporting: boolean;
  onDownload: () => Promise<void>;
}

/** Zip every track and take of the song into one archive. */
export function useDownloadAll<Song extends { directory: string; title: string }>(o: DownloadAllOptions<Song>): DownloadAll {
  const takes = o.store((s) => s.takes);
  const [isExporting, setIsExporting] = useState(false);

  return {
    isExporting,
    onDownload: async () => {
      setIsExporting(true);
      try {
        const entries = addTakeEntries(o.trackEntries(o.song, songDirectory(o.song)), takes);
        await o.exportAll(entries, `${o.song.title}.zip`);
      } catch (e) {
        console.error("[DownloadAllButton] exportAll failed:", e);
      } finally {
        setIsExporting(false);
      }
    },
  };
}
