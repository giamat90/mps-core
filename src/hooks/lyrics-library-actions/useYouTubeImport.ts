import { useState } from "react";

export const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

export interface YouTubeImportOptions {
  isProcessing: boolean;
  /** Starts the import; the app decides which arguments (quality, stems, cookies) go with the URL. */
  onImport: (url: string) => Promise<unknown>;
}

export interface YouTubeImport {
  url: string;
  setUrl: (url: string) => void;
  error: string | null;
  isProcessing: boolean;
  canSubmit: boolean;
  submit: () => Promise<void>;
  onKeyDown: (event: { key: string }) => void;
}

export function useYouTubeImport({ isProcessing, onImport }: YouTubeImportOptions): YouTubeImport {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!YOUTUBE_URL_PATTERN.test(url)) {
      setError("Please enter a valid YouTube URL.");
      return;
    }
    setError(null);
    await onImport(url);
    setUrl("");
  };

  return {
    url,
    setUrl,
    error,
    isProcessing,
    canSubmit: !isProcessing && url.trim() !== "",
    submit,
    onKeyDown: (event) => {
      if (event.key === "Enter" && !isProcessing) void submit();
    },
  };
}
