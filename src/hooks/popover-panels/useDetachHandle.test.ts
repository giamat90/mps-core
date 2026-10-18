// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { useDetachHandle } from "./useDetachHandle";

const pointer = (over: object = {}) => {
  const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) };
  return {
    target,
    event: { button: 0, pointerId: 1, currentTarget: target, clientX: 10, clientY: 10, screenX: 500, screenY: 400, ...over } as never,
  };
};

beforeEach(() => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(700);
});
afterEach(() => vi.restoreAllMocks());

const setup = (detach = vi.fn(async () => {}), onDetached = vi.fn()) => ({
  detach,
  onDetached,
  ...renderHook(() => useDetachHandle({ panel: "lyrics", detach, onDetached })),
});

describe("useDetachHandle", () => {
  it("pops the panel out where it was last, without coordinates", async () => {
    const { result, detach, onDetached } = setup();
    await act(async () => result.current.popOut());
    expect(detach).toHaveBeenCalledWith("lyrics", undefined, undefined);
    expect(onDetached).toHaveBeenCalledWith("lyrics");
  });

  it("detaches when the grip is released outside the window, at the release point", async () => {
    const { result, detach, onDetached } = setup();
    const down = pointer();
    act(() => result.current.gripProps.onPointerDown(down.event));
    expect(result.current.dragging).toBe(true);
    expect(down.target.setPointerCapture).toHaveBeenCalledWith(1);
    const up = pointer({ clientX: 1200, clientY: 100, screenX: 1700, screenY: 300 });
    await act(async () => result.current.gripProps.onPointerUp(up.event));
    expect(result.current.dragging).toBe(false);
    expect(up.target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(detach).toHaveBeenCalledWith("lyrics", expect.any(Number), expect.any(Number));
    expect(onDetached).toHaveBeenCalledOnce();
  });

  it("does nothing when released inside the window, and skips releasing a capture it no longer has", async () => {
    const { result, detach } = setup();
    const up = pointer();
    up.target.hasPointerCapture.mockReturnValue(false);
    await act(async () => result.current.gripProps.onPointerUp(up.event));
    expect(up.target.releasePointerCapture).not.toHaveBeenCalled();
    expect(detach).not.toHaveBeenCalled();
  });

  it("only starts a drag with the main button, and a cancel ends it", () => {
    const { result } = setup();
    act(() => result.current.gripProps.onPointerDown(pointer({ button: 2 }).event));
    expect(result.current.dragging).toBe(false);
    act(() => result.current.gripProps.onPointerDown(pointer().event));
    expect(result.current.dragging).toBe(true);
    act(() => result.current.gripProps.onPointerCancel());
    expect(result.current.dragging).toBe(false);
  });

  it("logs a failed window and does not mark the panel detached", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, onDetached } = setup(vi.fn(async () => { throw new Error("no window"); }));
    await act(async () => result.current.popOut());
    expect(error).toHaveBeenCalled();
    expect(onDetached).not.toHaveBeenCalled();
  });
});
