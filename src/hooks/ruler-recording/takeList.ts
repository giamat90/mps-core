import { useEffect, useState, type MouseEvent } from "react";
import { audibleTakes, type TakePlayback } from "../../takes";
import type { StoreHook } from "./storeHook";

export interface TakeLike {
  id: string;
  name?: string;
  filepath: string;
  recordedAt: string;
}

/** The slice of an app's player store the take list reads. */
export interface TakeListState {
  song: { title: string } | null;
  takes: readonly TakeLike[];
  activeTakeId: string | null;
  shownTakeIds: readonly string[];
  takePlayback: TakePlayback;
  mutedTakeIds: readonly string[];
  isRecording: boolean;
  muteTakesWhileRecording: boolean;
  soloedTakeId: string | null;
  toggleTake: (id: string) => void;
  deleteTake: (id: string) => void;
  renameTake: (id: string, name: string) => void;
}

export interface TakeListOptions<S extends TakeListState> {
  useStore: StoreHook<S>;
  /** Whether the takes as a whole are silent (main take mute, or another track soloed). */
  isSilenced: (state: S) => boolean;
  exportTake: (filepath: string, suggestedName: string) => Promise<void>;
  /** Runs once when the list mounts, for an app whose takes are not loaded with the song. */
  onMount?: () => void;
}

export function formatTakeDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function takeDisplayName(take: TakeLike, index: number): string {
  return take.name || `Take ${index + 1}`;
}

export type TakeVisualState = "playing" | "silent" | "hidden";

export interface TakeListBinding<S extends TakeListState> {
  takes: S["takes"];
  activeTakeId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  exportingId: string | null;
  displayName: (take: TakeLike, index: number) => string;
  isActive: (take: TakeLike) => boolean;
  isShown: (take: TakeLike) => boolean;
  isAudible: (take: TakeLike) => boolean;
  stateOf: (take: TakeLike) => TakeVisualState;
  hintFor: (take: TakeLike) => string;
  toggle: (take: TakeLike) => void;
  startEditing: (e: MouseEvent, take: TakeLike, index: number) => void;
  commitEdit: (take: TakeLike) => void;
  cancelEdit: () => void;
  download: (e: MouseEvent, take: TakeLike, index: number) => Promise<void>;
  remove: (e: MouseEvent, take: TakeLike) => void;
}

export function useTakeList<S extends TakeListState>({
  useStore,
  isSilenced,
  exportTake,
  onMount,
}: TakeListOptions<S>): TakeListBinding<S> {
  const song = useStore((s) => s.song);
  const takes = useStore((s) => s.takes);
  const activeTakeId = useStore((s) => s.activeTakeId);
  const shownTakeIds = useStore((s) => s.shownTakeIds);
  const toggleTake = useStore((s) => s.toggleTake);
  const takePlayback = useStore((s) => s.takePlayback);
  const mutedTakeIds = useStore((s) => s.mutedTakeIds);
  const isRecording = useStore((s) => s.isRecording);
  const muteTakesWhileRecording = useStore((s) => s.muteTakesWhileRecording);
  const soloedTakeId = useStore((s) => s.soloedTakeId);
  const silenced = useStore((s) => isSilenced(s));
  const deleteTake = useStore((s) => s.deleteTake);
  const renameTake = useStore((s) => s.renameTake);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    onMount?.();
  }, []);

  const audibleIds = audibleTakes({
    shown: shownTakeIds,
    active: activeTakeId,
    playback: takePlayback,
    muted: mutedTakeIds,
    recording: isRecording,
    muteWhileRecording: muteTakesWhileRecording,
    soloed: soloedTakeId,
    silenced,
  });

  const isShown = (take: TakeLike) => shownTakeIds.includes(take.id);
  const isAudible = (take: TakeLike) => audibleIds.includes(take.id);

  const stateOf = (take: TakeLike): TakeVisualState => (isAudible(take) ? "playing" : isShown(take) ? "silent" : "hidden");

  const hintFor = (take: TakeLike) => {
    if (!isShown(take)) return "Click to show this take";
    if (activeTakeId === take.id) return "Selected. Click to hide this take";
    return takePlayback === "selected" ? "Shown. Click to play this one" : "Shown. Click to select it";
  };

  const startEditing = (e: MouseEvent, take: TakeLike, index: number) => {
    e.stopPropagation();
    setEditingId(take.id);
    setEditValue(takeDisplayName(take, index));
  };

  const commitEdit = (take: TakeLike) => {
    setEditingId(null);
    renameTake(take.id, editValue);
  };

  const download = async (e: MouseEvent, take: TakeLike, index: number) => {
    e.stopPropagation();
    setExportingId(take.id);
    const name = takeDisplayName(take, index);
    const baseName = song ? `${song.title} - ${name}` : name;
    try {
      await exportTake(take.filepath, `${baseName}.wav`);
    } catch (err) {
      console.error("[TakeList] export failed:", err);
    } finally {
      setExportingId(null);
    }
  };

  const remove = (e: MouseEvent, take: TakeLike) => {
    e.stopPropagation();
    deleteTake(take.id);
  };

  return {
    takes,
    activeTakeId,
    editingId,
    editValue,
    setEditValue,
    exportingId,
    displayName: takeDisplayName,
    isActive: (take) => activeTakeId === take.id,
    isShown,
    isAudible,
    stateOf,
    hintFor,
    toggle: (take) => toggleTake(take.id),
    startEditing,
    commitEdit,
    cancelEdit: () => setEditingId(null),
    download,
    remove,
  };
}
