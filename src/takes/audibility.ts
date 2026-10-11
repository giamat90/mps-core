/** Which of the shown takes are heard together, or only the selected one. */
export type TakePlayback = "all" | "selected";

export interface TakeAudibility {
  /** Takes with a lane on screen, in the order they were shown. */
  readonly shown: readonly string[];
  /** The selected take: the one the analysis follows, and the one heard in "selected" mode. */
  readonly active: string | null;
  readonly playback: TakePlayback;
  /** Takes the user silenced on their own lane. */
  readonly muted: readonly string[];
  readonly recording: boolean;
  /** Keep the takes quiet while a new one is being recorded. */
  readonly muteWhileRecording: boolean;
}

/** The takes that have to be heard right now, in the order they were shown. */
export function audibleTakes(a: TakeAudibility): string[] {
  if (a.recording && a.muteWhileRecording) return [];
  const muted = new Set(a.muted);
  if (a.playback === "selected") {
    return a.active !== null && a.shown.includes(a.active) && !muted.has(a.active) ? [a.active] : [];
  }
  return a.shown.filter((id) => !muted.has(id));
}
