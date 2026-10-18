import { useState } from "react";
import type { StoreHook } from "./storeHook";

export interface MixPlan<Source> {
  sources: Source[];
  startSec: number;
  endSec: number;
}

export interface ExportMixOptions<S extends { song: { title: string } | null }, Source> {
  store: StoreHook<S>;
  /** What a change of which should refresh the button: the state `buildMixSources` reads besides `song`. */
  watch: readonly ((state: S) => unknown)[];
  buildMixSources: (state: S) => MixPlan<Source> | null;
  exportMix: (sources: Source[], startSec: number, endSec: number, suggestedName: string) => Promise<unknown>;
}

export interface ExportMix {
  /** Whether anything audible would be exported. */
  canExport: boolean;
  isExporting: boolean;
  onExport: () => Promise<void>;
}

/** Export the currently audible mix as one WAV. */
export function useExportMix<S extends { song: { title: string } | null }, Source>(o: ExportMixOptions<S, Source>): ExportMix {
  const { store } = o;
  // Subscribing to every input buildMixSources reads keeps the disabled state in sync with mute/solo/volume/take changes.
  store((s) => s.song);
  for (const select of o.watch) store(select);
  const [isExporting, setIsExporting] = useState(false);

  const mix = o.buildMixSources(store.getState());

  return {
    canExport: Boolean(mix),
    isExporting,
    onExport: async () => {
      const state = store.getState();
      const built = o.buildMixSources(state);
      if (!built || !state.song) return;
      setIsExporting(true);
      try {
        await o.exportMix(built.sources, built.startSec, built.endSec, `${state.song.title} - Mixdown.wav`);
      } catch (e) {
        console.error("[ExportMixButton] exportMix failed:", e);
      } finally {
        setIsExporting(false);
      }
    },
  };
}
