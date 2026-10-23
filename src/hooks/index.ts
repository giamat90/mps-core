// Headless hooks: the logic of the components both apps carry, with the store, the
// IPC calls and the dialogs passed in. The markup and the CSS stay in the apps.
// One section per group; add exports under the group's marker.

// --- group: popover-panels ---
export { usePopover } from "./popover-panels/usePopover";
export type { Popover } from "./popover-panels/usePopover";
export { usePanelMenu } from "./popover-panels/usePanelMenu";
export type {
  PanelMenu, PanelMenuFixedList, PanelMenuItem, PanelMenuListProps, UsePanelMenuOptions,
} from "./popover-panels/usePanelMenu";
export { useCollapsiblePanel } from "./popover-panels/useCollapsiblePanel";
export type { CollapsiblePanel } from "./popover-panels/useCollapsiblePanel";
export { useDetachHandle } from "./popover-panels/useDetachHandle";
export type { UseDetachHandleOptions } from "./popover-panels/useDetachHandle";
export { useDockHandle } from "./popover-panels/useDockHandle";
export type { UseDockHandleOptions } from "./popover-panels/useDockHandle";
export { LOOP_SECTION_SIZES, formatLoopClock, useLoopsMenu } from "./popover-panels/useLoopsMenu";
export type { LoopsMenu, LoopsMenuState, LoopsMenuStore } from "./popover-panels/useLoopsMenu";
// --- group: devices-transport ---
export type { StoreHook } from "./devices-transport/storeHook";
export { useDeviceSelect, useMicSelect, useOutputSelect } from "./devices-transport/useDeviceSelect";
export type {
  AudioDeviceInfo, DeviceSelect, DeviceSelectOption, DeviceSelectOptions, MicSelectState, OutputSelectState,
} from "./devices-transport/useDeviceSelect";
export { TRANSPOSE_MAX, TRANSPOSE_MIN, useKeyTranspose } from "./devices-transport/useKeyTranspose";
export type { KeyTranspose, KeyTransposeState } from "./devices-transport/useKeyTranspose";
export { useLoopToggle } from "./devices-transport/useLoopToggle";
export type { LoopToggle, LoopToggleState } from "./devices-transport/useLoopToggle";
export { RATE_MAX, RATE_MIN, RATE_STEP, formatDownbeat, useTempoControl } from "./devices-transport/useTempoControl";
export type { TempoControl, TempoControlOptions, TempoControlState } from "./devices-transport/useTempoControl";
export { useRecordButton } from "./devices-transport/useRecordButton";
export type { CountInBars, RecordButton, RecordButtonState } from "./devices-transport/useRecordButton";
export { formatClock, useTransportControls } from "./devices-transport/useTransportControls";
export type { TransportControls, TransportControlsOptions, TransportControlsState } from "./devices-transport/useTransportControls";
export { useExportMix } from "./devices-transport/useExportMix";
export type { ExportMix, ExportMixOptions, MixPlan } from "./devices-transport/useExportMix";
export { addTakeEntries, songDirectory, useDownloadAll } from "./devices-transport/useDownloadAll";
export type { DownloadAll, DownloadAllOptions, TakeFile, ZipEntry } from "./devices-transport/useDownloadAll";
// --- group: ruler-recording ---
export {
  FIRST_CLICK_S, INTERVAL_S, MAD_HIGH_CONFIDENCE_MS, MAD_MEDIUM_CONFIDENCE_MS, MAX_OFFSET_MS, MIN_DETECTED_CLAPS,
  N_COUNTIN, N_MEASURED, confidenceOf, detectClapLatency,
} from "./ruler-recording/clapLatency";
export type { ClapDetection, Confidence } from "./ruler-recording/clapLatency";
export { pickLoudestChannel, useLatencyCalibration } from "./ruler-recording/latencyCalibration";
export type {
  AudioDeviceLike, CalibrationMessages, CalibrationOffsetEntry, CalibrationPhase, LatencyCalibrationOptions,
  LatencyCalibrationState,
} from "./ruler-recording/latencyCalibration";
export { drawTimeRuler, formatRulerClock, tickInterval, useTimeRuler } from "./ruler-recording/timeRuler";
export type {
  TimeRulerBinding, TimeRulerHandlers, TimeRulerOptions, TimeRulerState, TimeRulerView,
} from "./ruler-recording/timeRuler";
export { formatTakeDate, takeDisplayName, useTakeList } from "./ruler-recording/takeList";
export type {
  TakeLike, TakeListBinding, TakeListOptions, TakeListState, TakeVisualState,
} from "./ruler-recording/takeList";
// --- group: lyrics-library-actions ---
export type { FileFilter, PickFile } from "./lyrics-library-actions/files";
export { useLyricsPanel } from "./lyrics-library-actions/useLyricsPanel";
export type { LyricsPanelOptions, LyricsPlayer, LyricsSong } from "./lyrics-library-actions/useLyricsPanel";
export { useYouTubeCookies } from "./lyrics-library-actions/useYouTubeCookies";
export type { YouTubeCookies, YouTubeCookiesOptions } from "./lyrics-library-actions/useYouTubeCookies";
export { YOUTUBE_URL_PATTERN, useYouTubeImport } from "./lyrics-library-actions/useYouTubeImport";
export type { YouTubeImport, YouTubeImportOptions } from "./lyrics-library-actions/useYouTubeImport";
export { AUDIO_EXTENSIONS, useDropZone } from "./lyrics-library-actions/useDropZone";
export type { DropZone, DropZoneOptions } from "./lyrics-library-actions/useDropZone";
export { useUpdateDialog } from "./lyrics-library-actions/useUpdateDialog";
export type { UpdateDialog } from "./lyrics-library-actions/useUpdateDialog";
// --- group: library-page-stores ---
export * from "./library-page-stores";
export { createSettingsStore } from "./app-stores/settingsStore";
export type { SettingsState, SettingsStore } from "./app-stores/settingsStore";
export { SEEK_FINE_STEP_S, SEEK_STEP_S, buildShortcuts, installPlayerShortcuts } from "./app-stores/playerShortcuts";
export type { ShortcutPlayer } from "./app-stores/playerShortcuts";
export { hiddenTrackTags } from "./app-stores/trackTags";
export { detachedTitle, dockSafely, runBridge, startMainBridgeHost, useBridgeRun, useMainBridgeHost } from "./app-stores/bridgeHost";
export type { BridgeRun, Disposable, MainBridgeHostOptions } from "./app-stores/bridgeHost";
export {};
