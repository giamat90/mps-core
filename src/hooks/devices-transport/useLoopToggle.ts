import type { StoreHook } from "./storeHook";

export interface LoopToggleState {
  punchIn: number | null;
  punchOut: number | null;
  punchLoop: boolean;
  isRecording: boolean;
  setPunchLoop: (on: boolean) => void;
}

export interface LoopToggle {
  active: boolean;
  disabled: boolean;
  title: string;
  toggle: () => void;
}

/** The loop button beside the transport: it loops the punch region, so it needs one. */
export function useLoopToggle(store: StoreHook<LoopToggleState>): LoopToggle {
  const punchIn = store((s) => s.punchIn);
  const punchOut = store((s) => s.punchOut);
  const punchLoop = store((s) => s.punchLoop);
  const isRecording = store((s) => s.isRecording);
  const setPunchLoop = store((s) => s.setPunchLoop);

  const hasRegion = punchIn !== null && punchOut !== null;
  return {
    active: punchLoop,
    disabled: !hasRegion || isRecording,
    title: !hasRegion ? "Set a punch region first" : punchLoop ? "Disable loop" : "Loop region",
    toggle: () => setPunchLoop(!punchLoop),
  };
}
