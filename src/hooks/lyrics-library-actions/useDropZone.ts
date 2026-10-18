import { useState } from "react";
import type { PickFile } from "./files";

export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"];

const AUDIO_FILTER = { name: "Audio", extensions: AUDIO_EXTENSIONS };

export interface DropZoneOptions {
  isProcessing: boolean;
  pickFile: PickFile;
  /** Starts the import of the confirmed file; the app adds its own options (quality, stems, kind). */
  onUpload: (path: string) => void;
}

export interface DropZone {
  pendingFile: string | null;
  fileName: string | null;
  pick: () => Promise<void>;
  confirm: () => void;
  cancel: () => void;
}

export function useDropZone({ isProcessing, pickFile, onUpload }: DropZoneOptions): DropZone {
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  return {
    pendingFile,
    fileName: pendingFile ? (pendingFile.split(/[\\/]/).pop() ?? pendingFile) : null,
    pick: async () => {
      if (isProcessing || pendingFile) return;
      const selected = await pickFile(AUDIO_FILTER);
      if (selected) setPendingFile(selected);
    },
    confirm: () => {
      if (!pendingFile) return;
      onUpload(pendingFile);
      setPendingFile(null);
    },
    cancel: () => setPendingFile(null),
  };
}
