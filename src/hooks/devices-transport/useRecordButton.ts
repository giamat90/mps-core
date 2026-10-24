import { useState } from "react";
import type { CountInPurpose } from "../../audio/countIn";
import type { StoreHook } from "./storeHook";

export interface RecordButtonState {
  isRecording: boolean;
  isSavingTake: boolean;
  isCountingIn: boolean;
  countInFor: CountInPurpose | null;
  countInBeatsRemaining: number;
  startRecording: () => Promise<unknown>;
  stopRecording: () => Promise<unknown>;
  cancelCountIn: () => void;
}

export interface RecordButton {
  isRecording: boolean;
  isSavingTake: boolean;
  /** A count-in the Record button owns: a recording's or a monitor's, not the one before Play. */
  isCountingIn: boolean;
  countInBeatsRemaining: number;
  error: string | null;
  recordLabel: string;
  onRecordClick: () => Promise<void>;
}

export function useRecordButton(store: StoreHook<RecordButtonState>): RecordButton {
  const isRecording = store((s) => s.isRecording);
  const isSavingTake = store((s) => s.isSavingTake);
  const countingIn = store((s) => s.isCountingIn);
  const countInFor = store((s) => s.countInFor);
  const countInBeatsRemaining = store((s) => s.countInBeatsRemaining);
  const startRecording = store((s) => s.startRecording);
  const stopRecording = store((s) => s.stopRecording);
  const cancelCountIn = store((s) => s.cancelCountIn);
  const [error, setError] = useState<string | null>(null);

  const isCountingIn = countingIn && countInFor !== "play";

  return {
    isRecording,
    isSavingTake,
    isCountingIn,
    countInBeatsRemaining,
    error,
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
  };
}
