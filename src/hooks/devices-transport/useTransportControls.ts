import type { StoreHook } from "./storeHook";

export interface TransportControlsState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  togglePlay: () => void;
  stop: () => void;
  stopRecording: () => Promise<unknown>;
  isRecording: boolean;
  skipToStart: () => void;
  skipToEnd: () => void;
}

export interface TransportControlsOptions {
  /** Stop ends a recording in progress (VPS). Where false, Stop is the plain `stop` action. */
  stopEndsRecording: boolean;
}

export interface TransportControls {
  isPlaying: boolean;
  isRecording: boolean;
  playLabel: string;
  currentText: string;
  durationText: string;
  togglePlay: () => void;
  onStop: () => void;
  skipToStart: () => void;
  skipToEnd: () => void;
}

/** `m:ss`. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useTransportControls(store: StoreHook<TransportControlsState>, o: TransportControlsOptions): TransportControls {
  const isPlaying = store((s) => s.isPlaying);
  const currentTime = store((s) => s.currentTime);
  const duration = store((s) => s.duration);
  const togglePlay = store((s) => s.togglePlay);
  const stop = store((s) => s.stop);
  const stopRecording = store((s) => s.stopRecording);
  const isRecording = store((s) => s.isRecording);
  const skipToStart = store((s) => s.skipToStart);
  const skipToEnd = store((s) => s.skipToEnd);

  return {
    isPlaying,
    isRecording,
    playLabel: isPlaying ? "Pause" : "Play",
    currentText: formatClock(currentTime),
    durationText: formatClock(duration),
    togglePlay,
    onStop: () => {
      if (o.stopEndsRecording && isRecording) void stopRecording();
      else stop();
    },
    skipToStart,
    skipToEnd,
  };
}
