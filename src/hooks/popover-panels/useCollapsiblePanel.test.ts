// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createCollapseStore } from "../../panels";
import { useCollapsiblePanel } from "./useCollapsiblePanel";

let n = 0;
beforeEach(() => localStorage.clear());

describe("useCollapsiblePanel", () => {
  it("is open until the title is clicked, then folds and unfolds", () => {
    const store = createCollapseStore({ storageKey: `ucp_${n++}` });
    const { result } = renderHook(() => useCollapsiblePanel(store, "pianoRoll"));
    expect(result.current.open).toBe(true);
    expect(result.current.buttonProps["aria-expanded"]).toBe(true);

    act(() => result.current.buttonProps.onClick());
    expect(result.current.open).toBe(false);
    expect(result.current.buttonProps["aria-expanded"]).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });

  it("is a button that submits nothing", () => {
    const store = createCollapseStore({ storageKey: `ucp_${n++}` });
    const { result } = renderHook(() => useCollapsiblePanel(store, "a"));
    expect(result.current.buttonProps.type).toBe("button");
  });

  it("follows the store, so two views of one panel stay together", () => {
    const store = createCollapseStore({ storageKey: `ucp_${n++}` });
    const one = renderHook(() => useCollapsiblePanel(store, "a"));
    const two = renderHook(() => useCollapsiblePanel(store, "a"));
    const other = renderHook(() => useCollapsiblePanel(store, "b"));
    act(() => one.result.current.toggle());
    expect(two.result.current.open).toBe(false);
    expect(other.result.current.open).toBe(true);
  });
});
