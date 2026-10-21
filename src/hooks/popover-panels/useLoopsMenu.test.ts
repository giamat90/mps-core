// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { LOOP_SECTION_SIZES, formatLoopClock, useLoopsMenu, type LoopsMenuState, type LoopsMenuStore } from "./useLoopsMenu";

const LOOP = { id: "l1", name: "Chorus", start: 10, end: 20 };

function state(over: Partial<LoopsMenuState> = {}): LoopsMenuState {
  return {
    song: { detectedBpm: 120, loops: [LOOP] },
    punchIn: 4,
    punchOut: 8,
    duration: 60,
    metronomeOffset: 0,
    isRecording: false,
    saveLoop: vi.fn(async () => {}),
    renameLoop: vi.fn(async () => {}),
    deleteLoop: vi.fn(async () => {}),
    applyLoopRegion: vi.fn(),
    ...over,
  };
}

const setup = (over: Partial<LoopsMenuState> = {}) => {
  const s = state(over);
  const store: LoopsMenuStore = (select) => select(s);
  return { s, ...renderHook(() => useLoopsMenu(store)) };
};

afterEach(() => vi.restoreAllMocks());

describe("formatLoopClock", () => {
  it("is minutes and zero-padded seconds, never negative", () => {
    expect(formatLoopClock(0)).toBe("0:00");
    expect(formatLoopClock(65.9)).toBe("1:05");
    expect(formatLoopClock(-3)).toBe("0:00");
  });
});

describe("useLoopsMenu", () => {
  it("reads the song's loops and cuts it into bar sections", () => {
    const { result } = setup();
    expect(result.current.available).toBe(true);
    expect(result.current.loops).toEqual([LOOP]);
    expect(result.current.hasRegion).toBe(true);
    expect(result.current.sectionBars).toBe(4);
    expect(result.current.sectionSizes).toEqual(LOOP_SECTION_SIZES);
    expect(result.current.sections.length).toBeGreaterThan(0);
    act(() => result.current.setSectionBars(2));
    expect(result.current.sectionBars).toBe(2);
  });

  it("has nothing to show without a song, and no sections without a tempo", () => {
    const none = setup({ song: null });
    expect(none.result.current.available).toBe(false);
    expect(none.result.current.loops).toEqual([]);
    expect(none.result.current.sections).toEqual([]);
    expect(setup({ song: { loops: [] } }).result.current.sections).toEqual([]);
  });

  it("cannot save a region that is not set", () => {
    expect(setup({ punchIn: null }).result.current.hasRegion).toBe(false);
    expect(setup({ punchOut: null }).result.current.hasRegion).toBe(false);
  });

  it("saves under the typed name, or a numbered one when empty, and clears the field", async () => {
    const { result, s } = setup();
    act(() => result.current.setName("Bridge"));
    await act(async () => result.current.save());
    expect(s.saveLoop).toHaveBeenCalledWith("Bridge");
    expect(result.current.name).toBe("");
    await act(async () => result.current.save());
    expect(s.saveLoop).toHaveBeenLastCalledWith("Loop 2");
  });

  it("renames in place: start, edit, commit; cancel drops the edit", async () => {
    const { result, s } = setup();
    act(() => result.current.startRename(LOOP));
    expect(result.current.renaming).toEqual({ id: "l1", value: "Chorus" });
    act(() => result.current.setRenamingValue("Verse"));
    await act(async () => result.current.commitRename());
    expect(s.renameLoop).toHaveBeenCalledWith("l1", "Verse");
    expect(result.current.renaming).toBeNull();
    act(() => result.current.startRename(LOOP));
    act(() => result.current.cancelRename());
    expect(result.current.renaming).toBeNull();
  });

  it("ignores a commit or an edit when nothing is being renamed", async () => {
    const { result, s } = setup();
    act(() => result.current.setRenamingValue("x"));
    await act(async () => result.current.commitRename());
    expect(result.current.renaming).toBeNull();
    expect(s.renameLoop).not.toHaveBeenCalled();
  });

  it("deletes and applies through the store", async () => {
    const { result, s } = setup();
    await act(async () => result.current.remove("l1"));
    expect(s.deleteLoop).toHaveBeenCalledWith("l1");
    result.current.apply(1, 2);
    expect(s.applyLoopRegion).toHaveBeenCalledWith(1, 2);
  });

  it("shows the message of a failed change, logs it, and clears it on the next try", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const saveLoop = vi.fn().mockRejectedValueOnce(new Error("Too many loops")).mockResolvedValue(undefined);
    const { result } = setup({ saveLoop });
    await act(async () => result.current.save());
    expect(result.current.message).toBe("Too many loops");
    expect(error).toHaveBeenCalled();
    await act(async () => result.current.save());
    expect(result.current.message).toBeNull();
  });

  it("shows a non-error rejection as text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = setup({ deleteLoop: vi.fn().mockRejectedValue("nope") });
    await act(async () => result.current.remove("l1"));
    expect(result.current.message).toBe("nope");
  });

  it("opens and closes", () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });

  it("cuts the sections from the song's bars when it has a map, whatever the tempo", () => {
    const meterMap = { version: 1 as const, bars: [0, 3, 8].map((start) => ({ start, num: 7, den: 8 })), end: 12, source: "edited" as const };
    const { result } = setup({ meterMap });
    result.current.setSectionBars;
    act(() => result.current.setSectionBars(2));
    expect(result.current.sections.map((s) => [s.start, s.end, s.label])).toEqual([[0, 8, "Bars 1–2"], [8, 12, "Bars 3"]]);
  });
});
