/** A device the user picked, remembered by its id and by the name it had. */
export interface SavedDevice {
  id: string;
  label: string;
}

/** The input and output the user wants in every song; null means "the system default". */
export interface AudioSetup {
  input: SavedDevice | null;
  output: SavedDevice | null;
}

export const EMPTY_AUDIO_SETUP: AudioSetup = { input: null, output: null };

export interface DeviceLike {
  deviceId: string;
  label: string;
}

export interface ResolvedDevice {
  /** The id to use now; null = system default (nothing saved, not connected, or the list is not readable yet). */
  id: string | null;
  /** Set when a device is saved but not connected, so the settings can say so. */
  missing: SavedDevice | null;
}

function asSavedDevice(raw: unknown): SavedDevice | null {
  if (raw === null || typeof raw !== "object") return null;
  const { id, label } = raw as { id?: unknown; label?: unknown };
  if (typeof id !== "string" || id === "") return null;
  return { id, label: typeof label === "string" ? label : "" };
}

/** Reads what was stored; anything malformed becomes "default" instead of failing. */
export function normalizeAudioSetup(raw: unknown): AudioSetup {
  if (raw === null || typeof raw !== "object") return EMPTY_AUDIO_SETUP;
  const { input, output } = raw as { input?: unknown; output?: unknown };
  return { input: asSavedDevice(input), output: asSavedDevice(output) };
}

/** What to save for a device picked from `devices`; null when the system default was picked. */
export function toSavedDevice(id: string | null, devices: readonly DeviceLike[]): SavedDevice | null {
  if (id === null || id === "") return null;
  const found = devices.find((d) => d.deviceId === id);
  return { id, label: found?.label ?? "" };
}

/**
 * Finds the saved device among the connected ones: by id first, then by name (an id can
 * change when the system re-enumerates the same hardware). Before the user allows the
 * microphone the browser lists devices without ids; nothing can be matched then, and
 * that is not reported as missing.
 */
export function resolveSavedDevice(saved: SavedDevice | null, devices: readonly DeviceLike[]): ResolvedDevice {
  if (saved === null) return { id: null, missing: null };
  if (!devices.some((d) => d.deviceId !== "")) return { id: null, missing: null };
  const byId = devices.find((d) => d.deviceId === saved.id);
  if (byId) return { id: byId.deviceId, missing: null };
  const byLabel = saved.label === "" ? undefined : devices.find((d) => d.label === saved.label && d.deviceId !== "");
  if (byLabel) return { id: byLabel.deviceId, missing: null };
  return { id: null, missing: saved };
}
