import { describe, it, expect, vi } from "vitest";
import { installShortcuts, matchShortcut, shouldIgnoreKey, type KeyEventLike, type ShortcutBinding } from "./shortcuts";

const ev = (over: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: " ",
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  target: { tagName: "DIV" },
  preventDefault: () => {},
  ...over,
});

const bind = (key: string, over: Partial<ShortcutBinding> = {}): ShortcutBinding => ({ key, run: () => {}, ...over });

describe("shouldIgnoreKey", () => {
  it("lets a plain key on the page through", () => {
    expect(shouldIgnoreKey(ev({ key: "l" }))).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("ignores keys typed into a %s", (tagName) => {
    expect(shouldIgnoreKey(ev({ key: "l", target: { tagName } }))).toBe(true);
  });

  it("ignores keys typed into an editable element", () => {
    expect(shouldIgnoreKey(ev({ key: "l", target: { tagName: "DIV", isContentEditable: true } }))).toBe(true);
  });

  it("ignores chords with ctrl, meta or alt so the browser and the OS keep theirs", () => {
    expect(shouldIgnoreKey(ev({ key: "l", ctrlKey: true }))).toBe(true);
    expect(shouldIgnoreKey(ev({ key: "l", metaKey: true }))).toBe(true);
    expect(shouldIgnoreKey(ev({ key: "l", altKey: true }))).toBe(true);
  });

  it("ignores auto-repeat and keys something else already handled", () => {
    expect(shouldIgnoreKey(ev({ key: "l", repeat: true }))).toBe(true);
    expect(shouldIgnoreKey(ev({ key: "l", defaultPrevented: true }))).toBe(true);
  });

  it("leaves space to a focused button, which clicks itself on space", () => {
    expect(shouldIgnoreKey(ev({ key: " ", target: { tagName: "BUTTON" } }))).toBe(true);
    expect(shouldIgnoreKey(ev({ key: "l", target: { tagName: "BUTTON" } }))).toBe(false);
  });
});

describe("matchShortcut", () => {
  it("matches a letter whatever its case", () => {
    const l = bind("l");
    expect(matchShortcut([l], ev({ key: "L" }))).toBe(l);
    expect(matchShortcut([l], ev({ key: "l" }))).toBe(l);
  });

  it("names the space bar space", () => {
    const space = bind("space");
    expect(matchShortcut([space], ev({ key: " " }))).toBe(space);
  });

  it("matches named keys by their key name", () => {
    const left = bind("ArrowLeft");
    expect(matchShortcut([left], ev({ key: "ArrowLeft" }))).toBe(left);
  });

  it("tells a binding with shift from one without", () => {
    const plain = bind("ArrowRight");
    const shifted = bind("ArrowRight", { shift: true });
    expect(matchShortcut([plain, shifted], ev({ key: "ArrowRight" }))).toBe(plain);
    expect(matchShortcut([plain, shifted], ev({ key: "ArrowRight", shiftKey: true }))).toBe(shifted);
  });

  it("matches nothing for an unbound key", () => {
    expect(matchShortcut([bind("l")], ev({ key: "x" }))).toBeUndefined();
  });
});

describe("installShortcuts", () => {
  function target() {
    let listener: ((e: KeyEventLike) => void) | null = null;
    return {
      addEventListener: vi.fn((_t: string, l: (e: KeyEventLike) => void) => {
        listener = l;
      }),
      removeEventListener: vi.fn(),
      fire: (e: KeyEventLike) => listener?.(e),
    };
  }

  it("runs the matching binding and stops the key default action", () => {
    const t = target();
    const run = vi.fn();
    const preventDefault = vi.fn();
    installShortcuts(t, [bind("space", { run })]);
    t.fire(ev({ key: " ", preventDefault }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("does nothing for an ignored or unbound key", () => {
    const t = target();
    const run = vi.fn();
    const preventDefault = vi.fn();
    installShortcuts(t, [bind("l", { run })]);
    t.fire(ev({ key: "l", target: { tagName: "INPUT" }, preventDefault }));
    t.fire(ev({ key: "q", preventDefault }));
    expect(run).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("reports a throwing binding and keeps listening", () => {
    const t = target();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    installShortcuts(t, [
      bind("l", {
        run: () => {
          throw new Error("boom");
        },
      }),
    ]);
    expect(() => t.fire(ev({ key: "l" }))).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("removes the listener when disposed", () => {
    const t = target();
    const dispose = installShortcuts(t, [bind("l")]);
    dispose();
    expect(t.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("uses the bindings it is given at the time of the key, not at install", () => {
    const t = target();
    const first = vi.fn();
    const second = vi.fn();
    let current = [bind("l", { run: first })];
    installShortcuts(t, () => current);
    current = [bind("l", { run: second })];
    t.fire(ev({ key: "l" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
