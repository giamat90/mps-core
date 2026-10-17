// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { useDockHandle } from "./useDockHandle";

const pointer = (over: object = {}) => {
  const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true) };
  return { target, event: { button: 0, pointerId: 3, currentTarget: target, ...over } as never };
};

const setup = (isOverMain = vi.fn(async () => true)) => {
  let t = 0;
  const dock = vi.fn(async () => {});
  return { dock, isOverMain, ...renderHook(() => useDockHandle({ isOverMain, dock, now: () => (t += 1000) })) };
};

describe("useDockHandle", () => {
  it("shows the drag from press to release and captures the pointer, and a release elsewhere docks nothing", async () => {
    const { result, dock } = setup(vi.fn(async () => false));
    const down = pointer();
    act(() => result.current.gripProps.onPointerDown(down.event));
    expect(result.current.dragging).toBe(true);
    expect(down.target.setPointerCapture).toHaveBeenCalledWith(3);
    const up = pointer();
    await act(async () => result.current.gripProps.onPointerUp(up.event));
    expect(result.current.dragging).toBe(false);
    expect(up.target.releasePointerCapture).toHaveBeenCalledWith(3);
    expect(dock).not.toHaveBeenCalled();
  });

  it("reports hovering the main window while carried, and docks on release there", async () => {
    const { result, dock } = setup();
    act(() => result.current.gripProps.onPointerDown(pointer().event));
    await act(async () => result.current.gripProps.onPointerMove());
    expect(result.current.over).toBe(true);
    await act(async () => result.current.gripProps.onPointerUp(pointer().event));
    expect(dock).toHaveBeenCalledOnce();
  });

  it("ignores other buttons and a capture it no longer has", async () => {
    const { result } = setup();
    act(() => result.current.gripProps.onPointerDown(pointer({ button: 1 }).event));
    expect(result.current.dragging).toBe(false);
    const up = pointer();
    up.target.hasPointerCapture.mockReturnValue(false);
    await act(async () => result.current.gripProps.onPointerUp(up.event));
    expect(up.target.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("a cancel ends the drag without docking", async () => {
    const { result, dock } = setup();
    act(() => result.current.gripProps.onPointerDown(pointer().event));
    act(() => result.current.gripProps.onPointerCancel());
    expect(result.current.dragging).toBe(false);
    await act(async () => result.current.gripProps.onPointerUp(pointer().event));
    expect(dock).not.toHaveBeenCalled();
  });

  it("uses the performance clock by default", () => {
    const { result } = renderHook(() => useDockHandle({ isOverMain: async () => false, dock: async () => {} }));
    act(() => result.current.gripProps.onPointerMove());
    expect(result.current.over).toBe(false);
  });
});
