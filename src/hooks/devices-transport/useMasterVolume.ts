import { useRef } from "react";
import { MASTER_DEFAULT, clampMaster, masterPercent } from "../../master";
import type { StoreHook } from "./storeHook";

export interface MasterVolumeState {
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
}

export interface MasterVolume {
  value: number;
  percentText: string;
  muted: boolean;
  /** The slider's value, a number or the string an input gives. */
  onChange: (raw: number | string) => void;
  /** Silences the master, and the next press brings back the level it had. */
  toggleMute: () => void;
  title: string;
}

/**
 * The one level above every track: the slider and the speaker button beside the transport.
 * It does not touch a track's own slider, mute or solo.
 */
export function useMasterVolume(store: StoreHook<MasterVolumeState>): MasterVolume {
  const value = store((s) => s.masterVolume);
  const setMasterVolume = store((s) => s.setMasterVolume);
  const before = useRef(MASTER_DEFAULT);

  const muted = value === 0;
  const percentText = masterPercent(value);
  return {
    value,
    percentText,
    muted,
    onChange: (raw) => {
      const next = clampMaster(typeof raw === "number" ? raw : parseFloat(raw));
      if (next > 0) before.current = next;
      setMasterVolume(next);
    },
    toggleMute: () => {
      if (muted) {
        setMasterVolume(before.current > 0 ? before.current : MASTER_DEFAULT);
      } else {
        before.current = value;
        setMasterVolume(0);
      }
    },
    title: muted ? "Master volume: muted. Click to bring it back" : `Master volume ${percentText}. Click to mute`,
  };
}
