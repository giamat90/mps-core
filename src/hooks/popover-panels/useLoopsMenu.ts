import { useState } from "react";
import { barSections, barSectionsFromMap, type BarSection, type NamedLoop } from "../../loops";
import type { BarMap } from "../../meter";
import { usePopover } from "./usePopover";

export const LOOP_SECTION_SIZES = [2, 4, 8, 16] as const;
const BEATS_PER_BAR = 4;
const DEFAULT_SECTION_BARS = 4;

export function formatLoopClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** What the loops menu reads from an app's player store (selectors, so each app keeps its own store). */
export interface LoopsMenuState {
  song: { detectedBpm?: number; loops?: readonly NamedLoop[] } | null;
  punchIn: number | null;
  punchOut: number | null;
  duration: number;
  metronomeOffset: number;
  /** The song's bars, when an app keeps them: sections are cut from those instead of from a tempo. */
  meterMap?: BarMap | null;
  isRecording: boolean;
  saveLoop: (name: string) => Promise<void>;
  renameLoop: (id: string, name: string) => Promise<void>;
  deleteLoop: (id: string) => Promise<void>;
  applyLoopRegion: (start: number, end: number) => void;
}

export type LoopsMenuStore = <T>(select: (state: LoopsMenuState) => T) => T;

export interface LoopsMenu {
  /** False without a song: the menu draws nothing. */
  available: boolean;
  open: boolean;
  toggle: () => void;
  rootRef: ReturnType<typeof usePopover>["rootRef"];
  loops: readonly NamedLoop[];
  hasRegion: boolean;
  isRecording: boolean;
  sectionSizes: readonly number[];
  sectionBars: number;
  setSectionBars: (bars: number) => void;
  sections: BarSection[];
  name: string;
  setName: (name: string) => void;
  save: () => Promise<void>;
  renaming: { id: string; value: string } | null;
  startRename: (loop: NamedLoop) => void;
  setRenamingValue: (value: string) => void;
  cancelRename: () => void;
  commitRename: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  apply: (start: number, end: number) => void;
  message: string | null;
}

export function useLoopsMenu(store: LoopsMenuStore): LoopsMenu {
  const song = store((s) => s.song);
  const punchIn = store((s) => s.punchIn);
  const punchOut = store((s) => s.punchOut);
  const duration = store((s) => s.duration);
  const metronomeOffset = store((s) => s.metronomeOffset);
  const meterMap = store((s) => s.meterMap ?? null);
  const isRecording = store((s) => s.isRecording);
  const saveLoop = store((s) => s.saveLoop);
  const renameLoop = store((s) => s.renameLoop);
  const deleteLoop = store((s) => s.deleteLoop);
  const applyLoopRegion = store((s) => s.applyLoopRegion);

  const popover = usePopover();
  const [name, setName] = useState("");
  const [sectionBars, setSectionBars] = useState<number>(DEFAULT_SECTION_BARS);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loops = song?.loops ?? [];
  const sections = song && meterMap && meterMap.bars.length > 0
    ? barSectionsFromMap(meterMap, sectionBars)
    : song
    ? barSections({
        duration,
        bpm: song.detectedBpm ?? 0,
        beatsPerBar: BEATS_PER_BAR,
        offset: metronomeOffset,
        barsPerSection: sectionBars,
      })
    : [];

  const attempt = async (action: () => Promise<void>) => {
    setMessage(null);
    try {
      await action();
    } catch (e) {
      console.error("[LoopsMenu] loop change failed:", e);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return {
    available: song !== null,
    open: popover.open,
    toggle: popover.toggle,
    rootRef: popover.rootRef,
    loops,
    hasRegion: punchIn !== null && punchOut !== null,
    isRecording,
    sectionSizes: LOOP_SECTION_SIZES,
    sectionBars,
    setSectionBars,
    sections,
    name,
    setName,
    save: () =>
      attempt(async () => {
        await saveLoop(name.trim() === "" ? `Loop ${loops.length + 1}` : name);
        setName("");
      }),
    renaming,
    startRename: (loop) => setRenaming({ id: loop.id, value: loop.name }),
    setRenamingValue: (value) => setRenaming((r) => (r ? { id: r.id, value } : r)),
    cancelRename: () => setRenaming(null),
    commitRename: () =>
      attempt(async () => {
        if (!renaming) return;
        await renameLoop(renaming.id, renaming.value);
        setRenaming(null);
      }),
    remove: (id) => attempt(() => deleteLoop(id)),
    apply: applyLoopRegion,
    message,
  };
}
