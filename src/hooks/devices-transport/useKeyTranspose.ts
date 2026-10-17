import { useState } from "react";
import type { StoreHook } from "./storeHook";

export const TRANSPOSE_MIN = -6;
export const TRANSPOSE_MAX = 6;

export interface KeyTransposeState {
  transpose: number;
  isTransposing: boolean;
  song: unknown;
  setTranspose: (semitones: number) => Promise<unknown>;
}

export interface KeyTranspose {
  transpose: number;
  isTransposing: boolean;
  disabled: boolean;
  /** The value being applied while a shift is under way, else the current one. */
  displayValue: number;
  /** `+3`, `0`, `-2`. */
  valueText: string;
  showReset: boolean;
  shift: (delta: number) => void;
  reset: () => void;
}

export function useKeyTranspose(store: StoreHook<KeyTransposeState>): KeyTranspose {
  const transpose = store((s) => s.transpose);
  const isTransposing = store((s) => s.isTransposing);
  const song = store((s) => s.song);
  const setTranspose = store((s) => s.setTranspose);
  const [pending, setPending] = useState<number | null>(null);

  const disabled = isTransposing || !song;
  const displayValue = isTransposing && pending !== null ? pending : transpose;

  const apply = (next: number) => {
    if (next === transpose) return;
    setPending(next);
    setTranspose(next)
      .catch((e: unknown) => console.error("[KeyTranspose] setTranspose failed:", e))
      .finally(() => setPending(null));
  };

  return {
    transpose,
    isTransposing,
    disabled,
    displayValue,
    valueText: displayValue > 0 ? `+${displayValue}` : `${displayValue}`,
    showReset: transpose !== 0 && !isTransposing,
    shift: (delta) => apply(Math.max(TRANSPOSE_MIN, Math.min(TRANSPOSE_MAX, transpose + delta))),
    reset: () => apply(0),
  };
}
