import type { CountInBars } from "../../audio/countIn";
import type { StoreHook } from "./storeHook";

export type { CountInBars };

const COUNT_IN_CYCLE: CountInBars[] = [0, 1, 2];

export interface CountInButtonState {
  isRecording: boolean;
  isSavingTake: boolean;
  isCountingIn: boolean;
  countInBars: CountInBars;
  setCountInBars: (bars: CountInBars) => void;
}

export interface CountInButton {
  countInBars: CountInBars;
  disabled: boolean;
  /** `⏱` or `⏱2`. */
  text: string;
  title: string;
  label: string;
  onClick: () => void;
}

/** The clock button that cycles the count-in 0, 1, 2 bars: it counts in Play, Record and Monitor alike. */
export function useCountInButton(store: StoreHook<CountInButtonState>): CountInButton {
  const isRecording = store((s) => s.isRecording);
  const isSavingTake = store((s) => s.isSavingTake);
  const isCountingIn = store((s) => s.isCountingIn);
  const countInBars = store((s) => s.countInBars);
  const setCountInBars = store((s) => s.setCountInBars);

  const bars = `${countInBars} bar${countInBars > 1 ? "s" : ""}`;

  return {
    countInBars,
    disabled: isRecording || isCountingIn || isSavingTake,
    text: countInBars > 0 ? `⏱${countInBars}` : "⏱",
    title:
      countInBars > 0
        ? `Count-in: ${bars} of click before playing or recording starts (click to change)`
        : "Count-in: off — click to enable a click count-off before playing or recording",
    label: countInBars > 0 ? `Count-in ${bars}` : "Count-in off",
    onClick: () => {
      const idx = COUNT_IN_CYCLE.indexOf(countInBars);
      setCountInBars(COUNT_IN_CYCLE[(idx + 1) % COUNT_IN_CYCLE.length]);
    },
  };
}
