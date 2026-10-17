// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import {
  formatTakeDate,
  takeDisplayName,
  useTakeList,
  type TakeLike,
  type TakeListOptions,
  type TakeListState,
} from "./takeList";

const take = (id: string, name?: string): TakeLike => ({ id, name, filepath: `/t/${id}.wav`, recordedAt: "2026-10-01T10:30:00Z" });

describe("takeDisplayName", () => {
  it("falls back to the one-based position", () => {
    expect(takeDisplayName(take("a"), 0)).toBe("Take 1");
    expect(takeDisplayName(take("a", ""), 2)).toBe("Take 3");
    expect(takeDisplayName(take("a", "Verse"), 2)).toBe("Verse");
  });
});

describe("formatTakeDate", () => {
  it("is a short readable date and time", () => {
    const text = formatTakeDate("2026-10-01T10:30:00Z");
    expect(text).toMatch(/\d/);
    expect(text.length).toBeGreaterThan(5);
  });
});

describe("useTakeList", () => {
  let state: TakeListState;
  let silenced: boolean;
  let exportTake: Mock<(filepath: string, suggestedName: string) => Promise<void>>;

  beforeEach(() => {
    silenced = false;
    exportTake = vi.fn<(filepath: string, suggestedName: string) => Promise<void>>().mockResolvedValue(undefined);
    state = {
      song: { title: "Song" },
      takes: [take("a", "First"), take("b"), take("c")],
      activeTakeId: "b",
      shownTakeIds: ["a", "b"],
      takePlayback: "selected",
      mutedTakeIds: [],
      isRecording: false,
      muteTakesWhileRecording: false,
      soloedTakeId: null,
      toggleTake: vi.fn(),
      deleteTake: vi.fn(),
      renameTake: vi.fn(),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  const setup = (over: Partial<TakeListOptions<TakeListState>> = {}) =>
    renderHook(() => useTakeList<TakeListState>({ useStore: (sel) => sel(state), isSilenced: () => silenced, exportTake, ...over }));

  const click = (): any => ({ stopPropagation: vi.fn() });

  it("exposes the takes and the selection", () => {
    const { result } = setup();
    expect(result.current.takes).toHaveLength(3);
    expect(result.current.activeTakeId).toBe("b");
    expect(result.current.isActive(state.takes[1])).toBe(true);
    expect(result.current.isShown(state.takes[2])).toBe(false);
  });

  it("tells playing, silent and hidden takes apart", () => {
    const { result } = setup();
    const [a, b, c] = state.takes;
    expect([result.current.stateOf(a), result.current.stateOf(b), result.current.stateOf(c)]).toEqual(["silent", "playing", "hidden"]);
    expect(result.current.isAudible(b)).toBe(true);
  });

  it("hears every shown take in all mode, and none when the take channel is silent", () => {
    state.takePlayback = "all";
    expect(setup().result.current.stateOf(state.takes[0])).toBe("playing");
    silenced = true;
    expect(setup().result.current.stateOf(state.takes[0])).toBe("silent");
  });

  it("explains what a click on each kind of take does", () => {
    const { result } = setup();
    const [a, b, c] = state.takes;
    expect(result.current.hintFor(c)).toBe("Click to show this take");
    expect(result.current.hintFor(b)).toBe("Selected. Click to hide this take");
    expect(result.current.hintFor(a)).toBe("Shown. Click to play this one");
    state.takePlayback = "all";
    expect(setup().result.current.hintFor(a)).toBe("Shown. Click to select it");
  });

  it("toggles and deletes by id, deleting without also toggling", () => {
    const { result } = setup();
    result.current.toggle(state.takes[0]);
    expect(state.toggleTake).toHaveBeenCalledWith("a");
    const e = click();
    result.current.remove(e, state.takes[2]);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(state.deleteTake).toHaveBeenCalledWith("c");
  });

  it("starts renaming from the name, or the default name", () => {
    const { result } = setup();
    act(() => result.current.startEditing(click(), state.takes[0], 0));
    expect(result.current.editingId).toBe("a");
    expect(result.current.editValue).toBe("First");
    act(() => result.current.startEditing(click(), state.takes[1], 1));
    expect(result.current.editValue).toBe("Take 2");
  });

  it("commits a rename with the edited text and closes the editor", () => {
    const { result } = setup();
    act(() => result.current.startEditing(click(), state.takes[0], 0));
    act(() => result.current.setEditValue("Chorus"));
    act(() => result.current.commitEdit(state.takes[0]));
    expect(state.renameTake).toHaveBeenCalledWith("a", "Chorus");
    expect(result.current.editingId).toBeNull();
  });

  it("cancels a rename without saving", () => {
    const { result } = setup();
    act(() => result.current.startEditing(click(), state.takes[0], 0));
    act(() => result.current.cancelEdit());
    expect(result.current.editingId).toBeNull();
    expect(state.renameTake).not.toHaveBeenCalled();
  });

  it("exports under the song and take name, marking the take busy meanwhile", async () => {
    let finish!: () => void;
    exportTake.mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { result } = setup();
    let done!: Promise<void>;
    act(() => { done = result.current.download(click(), state.takes[0], 0); });
    expect(result.current.exportingId).toBe("a");
    expect(exportTake).toHaveBeenCalledWith("/t/a.wav", "Song - First.wav");
    await act(async () => { finish(); await done; });
    expect(result.current.exportingId).toBeNull();
  });

  it("exports under the take name alone when no song is loaded", async () => {
    state.song = null;
    const { result } = setup();
    await act(async () => { await result.current.download(click(), state.takes[1], 1); });
    expect(exportTake).toHaveBeenCalledWith("/t/b.wav", "Take 2.wav");
  });

  it("logs a failed export and frees the take", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    exportTake.mockRejectedValue(new Error("disk full"));
    const { result } = setup();
    await act(async () => { await result.current.download(click(), state.takes[0], 0); });
    expect(error).toHaveBeenCalled();
    expect(result.current.exportingId).toBeNull();
  });

  it("runs onMount once, and only when given", () => {
    const onMount = vi.fn();
    const { rerender } = setup({ onMount });
    rerender();
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(() => setup()).not.toThrow();
  });
});
