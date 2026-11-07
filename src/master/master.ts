/** Where the master level is kept, so it survives a restart and is the same for every song. */
export const MASTER_STORAGE_KEY = "mps_master_volume";
export const MASTER_DEFAULT = 1;
export const MASTER_STEP = 0.01;

/**
 * A level the player can use: a finite number from 0 to 1, to the hundredth. Anything else
 * (a stored string that is not a number, NaN from an empty field) is the default, not silence.
 * There is no boost above 1: the media elements under the waveforms cap at 1.
 */
export function clampMaster(value: number): number {
  if (!Number.isFinite(value)) return MASTER_DEFAULT;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/** A track's own gain under the master level. It never rises above the track's own gain. */
export function applyMaster(gain: number, master: number): number {
  return gain * clampMaster(master);
}

/** `"80%"`. */
export function masterPercent(master: number): string {
  return `${Math.round(clampMaster(master) * 100)}%`;
}

export function loadMasterVolume(): number {
  try {
    const raw = localStorage.getItem(MASTER_STORAGE_KEY);
    if (raw === null) return MASTER_DEFAULT;
    return clampMaster(parseFloat(raw));
  } catch (e) {
    console.warn("[master] Could not load the master volume:", e);
    return MASTER_DEFAULT;
  }
}

export function saveMasterVolume(master: number): void {
  try {
    localStorage.setItem(MASTER_STORAGE_KEY, String(clampMaster(master)));
  } catch (e) {
    console.warn("[master] Could not persist the master volume:", e);
  }
}
