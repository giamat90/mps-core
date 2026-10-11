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

/** Why a take is not heard, in the order the rules apply. `null` means it is heard. */
export type TakeSilence =
  | "hidden"
  | "channel" // the main take mute is on, or another track is soloed
  | "recording"
  | "soloed-other" // another take is soloed on its lane
  | "muted" // muted on its own lane
  | "not-selected"; // selected-only mode and this is not the selected take

export function takeSilence(a: TakeAudibility, id: string): TakeSilence | null {
  if (!a.shown.includes(id)) return "hidden";
  if (a.silenced) return "channel";
  if (a.recording && a.muteWhileRecording) return "recording";
  if (a.soloed != null && a.shown.includes(a.soloed)) return a.soloed === id ? null : "soloed-other";
  if (a.muted.includes(id)) return "muted";
  if (a.playback === "selected" && a.active !== id) return "not-selected";
  return null;
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
