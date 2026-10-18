// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { usePopover } from "./usePopover";

function mounted() {
  const root = document.createElement("div");
  const inside = document.createElement("button");
  root.appendChild(inside);
  document.body.append(root);
  const hook = renderHook(() => usePopover());
  hook.result.current.rootRef.current = root;
  return { ...hook, root, inside };
}

const press = (target: EventTarget) => act(() => void target.dispatchEvent(new Event("pointerdown", { bubbles: true })));

describe("usePopover", () => {
  it("starts closed and toggles", () => {
    const { result } = renderHook(() => usePopover());
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("closes on a press outside the root, not on one inside it", () => {
    const { result, root, inside } = mounted();
    act(() => result.current.setOpen(true));
    press(inside);
    expect(result.current.open).toBe(true);
    press(document.body);
    expect(result.current.open).toBe(false);
    root.remove();
  });

  it("closes on Escape and ignores other keys", () => {
    const { result, root } = mounted();
    act(() => result.current.setOpen(true));
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })));
    expect(result.current.open).toBe(true);
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.open).toBe(false);
    root.remove();
  });

  it("listens only while open, and stops after unmount", () => {
    const { result, unmount, root } = mounted();
    press(document.body);
    expect(result.current.open).toBe(false);
    act(() => result.current.setOpen(true));
    unmount();
    press(document.body);
    root.remove();
  });

  it("treats a press as outside when nothing is attached", () => {
    const { result } = renderHook(() => usePopover());
    act(() => result.current.setOpen(true));
    press(document.body);
    expect(result.current.open).toBe(true);
  });
});
