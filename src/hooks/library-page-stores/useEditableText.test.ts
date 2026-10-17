// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { useEditableText } from "./useEditableText";

describe("useEditableText", () => {
  it("starts from the current value and stops the click reaching the row", () => {
    const stop = vi.fn();
    const { result } = renderHook(() => useEditableText("Song", vi.fn()));
    expect(result.current.editing).toBe(false);
    act(() => result.current.start({ stopPropagation: stop }));
    expect(stop).toHaveBeenCalled();
    expect(result.current.editing).toBe(true);
    expect(result.current.text).toBe("Song");
  });

  it("commits a trimmed, changed value on Enter", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEditableText("Song", onCommit));
    act(() => result.current.start());
    act(() => result.current.setText("  New  "));
    act(() => result.current.onKeyDown({ key: "Enter" }));
    expect(onCommit).toHaveBeenCalledWith("New");
    expect(result.current.editing).toBe(false);
  });

  it("commits nothing for an empty or unchanged value", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEditableText("Song", onCommit));
    act(() => result.current.start());
    act(() => result.current.commit());
    act(() => result.current.start());
    act(() => result.current.setText("   "));
    act(() => result.current.commit());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels on Escape and ignores other keys", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEditableText("Song", onCommit));
    act(() => result.current.start());
    act(() => result.current.setText("Other"));
    act(() => result.current.onKeyDown({ key: "a" }));
    expect(result.current.editing).toBe(true);
    act(() => result.current.onKeyDown({ key: "Escape" }));
    expect(result.current.editing).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("restarts from the value as it is now, not from an earlier edit", () => {
    let value = "A";
    const { result, rerender } = renderHook(() => useEditableText(value, vi.fn()));
    act(() => result.current.start());
    act(() => result.current.setText("draft"));
    act(() => result.current.cancel());
    value = "B";
    rerender();
    act(() => result.current.start());
    expect(result.current.text).toBe("B");
  });
});
