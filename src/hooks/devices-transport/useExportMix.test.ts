// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { useExportMix, type MixPlan } from "./useExportMix";

afterEach(() => vi.restoreAllMocks());

interface S {
  song: { title: string } | null;
  muted: boolean;
}

const plan: MixPlan<string> = { sources: ["a"], startSec: 1, endSec: 9 };

const setup = (patch: Partial<S> = {}, build: (s: S) => MixPlan<string> | null = (s) => (s.muted ? null : plan)) => {
  const store = createFakeStore<S>({ song: { title: "Song One" }, muted: false, ...patch });
  const exportMix = vi.fn(async () => {});
  const buildMixSources = vi.fn(build);
  const hook = renderHook(() => useExportMix({ store, watch: [(s: S) => s.muted], buildMixSources, exportMix }));
  return { store, exportMix, buildMixSources, ...hook };
};

describe("useExportMix", () => {
  it("can export while something is audible and follows the watched state", () => {
    const { result, store } = setup();
    expect(result.current.canExport).toBe(true);
    act(() => store.set({ muted: true }));
    expect(result.current.canExport).toBe(false);
  });

  it("exports the built mix under the song's name and shows progress", async () => {
    let finish!: () => void;
    const { result, exportMix } = setup();
    exportMix.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.onExport();
    });
    expect(result.current.isExporting).toBe(true);
    expect(exportMix).toHaveBeenCalledWith(["a"], 1, 9, "Song One - Mixdown.wav");
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isExporting).toBe(false);
  });

  it("does nothing when there is nothing to export or no song", async () => {
    const muted = setup({ muted: true });
    await act(() => muted.result.current.onExport());
    expect(muted.exportMix).not.toHaveBeenCalled();
    const noSong = setup({ song: null });
    await act(() => noSong.result.current.onExport());
    expect(noSong.exportMix).not.toHaveBeenCalled();
  });

  it("logs a failed export and recovers", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("disk full");
    const { result, exportMix } = setup();
    exportMix.mockRejectedValue(boom);
    await act(() => result.current.onExport());
    expect(error).toHaveBeenCalledWith("[ExportMixButton] exportMix failed:", boom);
    expect(result.current.isExporting).toBe(false);
  });
});
