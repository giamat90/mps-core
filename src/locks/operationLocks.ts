/**
 * What is running, as far as deciding what else may start. Every field is
 * optional because the two apps do not have all of them (SPS has no monitor);
 * an absent field means "not happening".
 */
export interface BusyState {
  isLoadingSong?: boolean;
  isTransposing?: boolean;
  isRecording?: boolean;
  isMonitoring?: boolean;
  isCountingIn?: boolean;
  isSavingTake?: boolean;
}

export type LockReason = string | null;

/** For each group of actions: null when it may run, else the sentence to show as the reason it cannot. */
export interface OperationLocks {
  /** Play, pause, stop, skip and seeking: they move or start the engine. */
  playback: LockReason;
  record: LockReason;
  monitor: LockReason;
  transpose: LockReason;
  /** Deleting or renaming takes, and anything else that rewrites the take list. */
  takeEdit: LockReason;
  /** Exporting what is audible: the tracks it reads must not be swapped under it. */
  exportAudio: LockReason;
  /** Leaving the song, which tears the engine and the recorder down. */
  leave: LockReason;
}

/**
 * The one table of what may not start while something else runs. It is a pure
 * function of the player state, so the stores refuse the action (a keyboard
 * shortcut gets no further than a button does) and the buttons stay in place,
 * disabled, with the reason as their tooltip.
 */
export function operationLocks(s: BusyState): OperationLocks {
  const loading = s.isLoadingSong ? "The song is still loading" : null;
  const transposing = s.isTransposing ? "Wait for the transpose to finish" : null;
  const saving = s.isSavingTake ? "Wait for the take to finish analyzing" : null;
  const recording = s.isRecording ? "Stop recording first" : null;
  const live = recording ?? (s.isMonitoring ? "Stop monitoring first" : null) ?? (s.isCountingIn ? "Wait for the count-in" : null);

  return {
    playback: loading ?? transposing,
    record: loading ?? transposing ?? saving,
    monitor: loading ?? transposing,
    transpose: loading ?? transposing ?? saving ?? live,
    takeEdit: saving ?? recording,
    exportAudio: loading ?? transposing,
    leave: transposing ?? saving ?? recording,
  };
}
