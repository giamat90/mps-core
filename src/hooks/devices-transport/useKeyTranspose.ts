import { useState } from "react";
import type { StoreHook } from "./storeHook";
import { operationLocks, type BusyState } from "../../locks";

export const TRANSPOSE_MIN = -6;
export const TRANSPOSE_MAX = 6;

export interface KeyTransposeState extends BusyState {
  transpose: number;
  isTransposing: boolean;
  song: unknown;
  setTranspose: (semitones: number) => Promise<unknown>;
}

export interface KeyTranspose {
  transpose: number;
  isTransposing: boolean;
  disabled: boolean;
  /** Why the buttons cannot be used right now (a transpose under way, a recording, ...), else null. */
  lockReason: string | null;
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

  const lockReason = store((s) => operationLocks(s).transpose);
  const disabled = !song || lockReason !== null;
  const displayValue = isTransposing && pending !== null ? pending : transpose;

  const apply = (next: number) => {
    if (next === transpose || store.getState().song === null || operationLocks(store.getState()).transpose !== null) return;
    setPending(next);
    setTranspose(next)
      .catch((e: unknown) => console.error("[KeyTranspose] setTranspose failed:", e))
      .finally(() => setPending(null));
  };

  return {
    transpose,
    isTransposing,
    disabled,
    lockReason,
    displayValue,
    valueText: displayValue > 0 ? `+${displayValue}` : `${displayValue}`,
    showReset: displayValue !== 0,
    shift: (delta) => apply(Math.max(TRANSPOSE_MIN, Math.min(TRANSPOSE_MAX, transpose + delta))),
    reset: () => apply(0),
  };
}
