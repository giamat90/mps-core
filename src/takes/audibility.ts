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
  /** A take soloed on its lane: heard alone among the takes, whatever the mode and the lane mutes. */
  readonly soloed?: string | null;
  /**
   * The takes as a whole are silent: the main take mute is on, or another track is
   * soloed. It outranks everything on the lanes, which only choose among takes.
   */
  readonly silenced?: boolean;
}

/** The takes that have to be heard right now, in the order they were shown. */
export function audibleTakes(a: TakeAudibility): string[] {
  if (a.silenced) return [];
  if (a.recording && a.muteWhileRecording) return [];
  if (a.soloed != null && a.shown.includes(a.soloed)) return [a.soloed];
  const muted = new Set(a.muted);
  if (a.playback === "selected") {
    return a.active !== null && a.shown.includes(a.active) && !muted.has(a.active) ? [a.active] : [];
  }
  return a.shown.filter((id) => !muted.has(id));
}
