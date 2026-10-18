import { useEffect } from "react";
import type { StoreHook } from "./storeHook";

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

export interface DeviceSelectOption {
  id: string;
  label: string;
}

export interface DeviceSelectOptions {
  devices: readonly AudioDeviceInfo[];
  selectedId: string | null;
  fetchDevices: () => unknown;
  select: (id: string | null) => unknown;
  /** Shown, with the first characters of the id, for a device the browser gives no label. */
  unnamedPrefix: string;
  disabled: boolean;
  /** When set and `select` returns a promise, a rejection is logged with this text. */
  selectFailureLog?: string;
}

export interface DeviceSelect {
  value: string;
  disabled: boolean;
  options: DeviceSelectOption[];
  onChange: (value: string) => void;
}

export function useDeviceSelect(o: DeviceSelectOptions): DeviceSelect {
  const { fetchDevices } = o;
  useEffect(() => {
    void fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    value: o.selectedId ?? "",
    disabled: o.disabled,
    options: o.devices.map((d) => ({ id: d.deviceId, label: d.label || `${o.unnamedPrefix} ${d.deviceId.slice(0, 6)}` })),
    onChange: (value) => {
      const result = o.select(value || null);
      if (o.selectFailureLog && result instanceof Promise) {
        result.catch((err: unknown) => console.error(o.selectFailureLog, err));
      }
    },
  };
}

export interface MicSelectState {
  audioDevices: readonly AudioDeviceInfo[];
  selectedDeviceId: string | null;
  fetchAudioDevices: () => unknown;
  setAudioDevice: (id: string | null) => unknown;
  isRecording: boolean;
}

/** The input picker: locked while recording. */
export function useMicSelect(store: StoreHook<MicSelectState>): DeviceSelect {
  const devices = store((s) => s.audioDevices);
  const selectedId = store((s) => s.selectedDeviceId);
  const fetchDevices = store((s) => s.fetchAudioDevices);
  const select = store((s) => s.setAudioDevice);
  const isRecording = store((s) => s.isRecording);
  return useDeviceSelect({ devices, selectedId, fetchDevices, select, unnamedPrefix: "Microphone", disabled: isRecording });
}

export interface OutputSelectState {
  outputDevices: readonly AudioDeviceInfo[];
  selectedOutputDeviceId: string | null;
  fetchOutputDevices: () => unknown;
  setOutputDevice: (id: string | null) => Promise<unknown>;
  song: unknown;
}

/** The output picker: needs a loaded song (the sink belongs to the audio engine). */
export function useOutputSelect(store: StoreHook<OutputSelectState>): DeviceSelect {
  const devices = store((s) => s.outputDevices);
  const selectedId = store((s) => s.selectedOutputDeviceId);
  const fetchDevices = store((s) => s.fetchOutputDevices);
  const select = store((s) => s.setOutputDevice);
  const song = store((s) => s.song);
  return useDeviceSelect({
    devices,
    selectedId,
    fetchDevices,
    select,
    unnamedPrefix: "Speaker",
    disabled: !song,
    selectFailureLog: "[OutputSelector] setSinkId failed:",
  });
}
