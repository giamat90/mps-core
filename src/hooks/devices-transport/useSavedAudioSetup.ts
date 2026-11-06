import { resolveSavedDevice, type AudioSetup, type DeviceLike, type SavedDevice } from "../../audio-setup";
import type { StoreHook } from "./storeHook";

export interface SavedAudioSettingsState {
  audioSetup: AudioSetup;
}

export interface SavedAudioSetupState {
  audioDevices: readonly DeviceLike[];
  outputDevices: readonly DeviceLike[];
  setAudioDevice: (id: string | null) => unknown;
  setOutputDevice: (id: string | null) => unknown;
}

export interface SavedAudioSetup {
  /** What is remembered for every song, or null for the system default. */
  input: SavedDevice | null;
  output: SavedDevice | null;
  /** The remembered device when it is not connected (the system default is used meanwhile). */
  inputMissing: SavedDevice | null;
  outputMissing: SavedDevice | null;
  /** Back to the system input and output in every song. */
  reset: () => void;
}

/**
 * The settings panel's view of the global audio setup: what is remembered, whether it is
 * connected, and a reset. The pickers themselves are `useMicSelect` / `useOutputSelect`; the
 * player store writes the remembered setup whenever either changes.
 */
export function useSavedAudioSetup(o: {
  settings: StoreHook<SavedAudioSettingsState>;
  player: StoreHook<SavedAudioSetupState>;
}): SavedAudioSetup {
  const setup = o.settings((s) => s.audioSetup);
  const inputs = o.player((s) => s.audioDevices);
  const outputs = o.player((s) => s.outputDevices);
  return {
    input: setup.input,
    output: setup.output,
    inputMissing: resolveSavedDevice(setup.input, inputs).missing,
    outputMissing: resolveSavedDevice(setup.output, outputs).missing,
    reset: () => {
      const player = o.player.getState();
      player.setAudioDevice(null);
      player.setOutputDevice(null);
    },
  };
}
