import { useState } from "react";
import type { StoreHook } from "./storeHook";

export type CountInBars = 0 | 1 | 2;
const COUNT_IN_CYCLE: CountInBars[] = [0, 1, 2];

export interface RecordButtonState {
  isRecording: boolean;
  isSavingTake: boolean;
  isCountingIn: boolean;
  countInBars: CountInBars;
  countInBeatsRemaining: number;
  startRecording: () => Promise<unknown>;
  stopRecording: () => Promise<unknown>;
  cancelCountIn: () => void;
  setCountInBars: (bars: CountInBars) => void;
}

export interface RecordButton {
  isRecording: boolean;
  isSavingTake: boolean;
  isCountingIn: boolean;
  countInBars: CountInBars;
  countInBeatsRemaining: number;
  error: string | null;
  countInDisabled: boolean;
  /** `⏱` or `⏱2`. */
  countInText: string;
  countInTitle: string;
  countInLabel: string;
  recordLabel: string;
  onRecordClick: () => Promise<void>;
  onCountInClick: () => void;
}

export function useRecordButton(store: StoreHook<RecordButtonState>): RecordButton {
  const isRecording = store((s) => s.isRecording);
  const isSavingTake = store((s) => s.isSavingTake);
  const isCountingIn = store((s) => s.isCountingIn);
  const countInBars = store((s) => s.countInBars);
  const countInBeatsRemaining = store((s) => s.countInBeatsRemaining);
  const startRecording = store((s) => s.startRecording);
  const stopRecording = store((s) => s.stopRecording);
  const cancelCountIn = store((s) => s.cancelCountIn);
  const setCountInBars = store((s) => s.setCountInBars);
  const [error, setError] = useState<string | null>(null);

  const bars = `${countInBars} bar${countInBars > 1 ? "s" : ""}`;

  return {
    isRecording,
    isSavingTake,
    isCountingIn,
    countInBars,
    countInBeatsRemaining,
    error,
    countInDisabled: isRecording || isCountingIn || isSavingTake,
    countInText: countInBars > 0 ? `⏱${countInBars}` : "⏱",
    countInTitle:
      countInBars > 0
        ? `Count-in: ${bars} of click before recording starts (click to change)`
        : "Count-in: off — click to enable a click count-off before recording",
    countInLabel: countInBars > 0 ? `Count-in ${bars}` : "Count-in off",
    recordLabel: isRecording ? "Stop recording" : isCountingIn ? "Cancel count-in" : "Record",
    onRecordClick: async () => {
      setError(null);
      try {
        if (isRecording) {
          await stopRecording();
        } else if (isCountingIn) {
          cancelCountIn();
        } else {
          await startRecording();
        }
      } catch (e) {
        console.error("[RecordButton] recording action failed:", e);
        setError(e instanceof Error ? e.message : "Recording failed");
      }
    },
    onCountInClick: () => {
      const idx = COUNT_IN_CYCLE.indexOf(countInBars);
      setCountInBars(COUNT_IN_CYCLE[(idx + 1) % COUNT_IN_CYCLE.length]);
    },
  };
}
