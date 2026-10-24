// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { installPlayerShortcuts, type ShortcutPlayer } from "./playerShortcuts";

function player(over: Partial<ShortcutPlayer> = {}): ShortcutPlayer {
  return {
    isRecording: false,
    isCountingIn: false,
    currentTime: 10,
    duration: 100,
    punchIn: null,
    punchOut: null,
    punchLoop: false,
    togglePlay: vi.fn(),
    skipToStart: vi.fn(),
    skipToEnd: vi.fn(),
    seek: vi.fn(),
    setPunchIn: vi.fn(),
    setPunchOut: vi.fn(),
    setPunchLoop: vi.fn(),
    ...over,
  };
}

describe("installPlayerShortcuts", () => {
  it("binds the keys on the window, reading the player when a key is pressed", () => {
    const p = player();
    const stop = installPlayerShortcuts(() => p);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(p.togglePlay).toHaveBeenCalledTimes(1);
    expect(p.seek).toHaveBeenCalledWith(15);
    stop();
  });

  it("stops listening when stopped", () => {
    const p = player();
    installPlayerShortcuts(() => p)();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(p.togglePlay).not.toHaveBeenCalled();
  });

  it("lets Space through while counting in, to cancel the count, and nothing else", () => {
    const p = player({ isCountingIn: true });
    const stop = installPlayerShortcuts(() => p);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(p.togglePlay).toHaveBeenCalledTimes(1);
    expect(p.seek).not.toHaveBeenCalled();
    expect(p.skipToStart).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing while recording", () => {
    const p = player({ isRecording: true });
    const stop = installPlayerShortcuts(() => p);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(p.togglePlay).not.toHaveBeenCalled();
    stop();
  });
});
