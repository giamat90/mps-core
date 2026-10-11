/** The part of a DOM KeyboardEvent this module reads, so it runs without a DOM. */
export interface KeyEventLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  preventDefault(): void;
}

export interface KeyEventTarget {
  addEventListener(type: "keydown", listener: (event: KeyEventLike) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyEventLike) => void): void;
}

export interface ShortcutBinding {
  /** "space", a letter or digit in lower case, or a KeyboardEvent.key name such as "ArrowLeft" or "Home". */
  key: string;
  shift?: boolean;
  run: () => void;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when the key is not meant for the page: typing, a chord, a repeat, or already handled. */
export function shouldIgnoreKey(event: KeyEventLike): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (event.repeat || event.defaultPrevented) return true;
  const target = event.target;
  if (target?.isContentEditable) return true;
  const tag = target?.tagName?.toUpperCase();
  if (tag && TYPING_TAGS.has(tag)) return true;
  if (event.key === " " && tag === "BUTTON") return true;
  return false;
}

function keyName(event: KeyEventLike): string {
  if (event.key === " ") return "space";
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function matchShortcut(bindings: readonly ShortcutBinding[], event: KeyEventLike): ShortcutBinding | undefined {
  const name = keyName(event);
  return bindings.find((b) => b.key === name && (b.shift ?? false) === event.shiftKey);
}

/** Listens for keydown on `target` and runs the matching binding. Returns the function that stops it. */
export function installShortcuts(
  target: KeyEventTarget,
  bindings: readonly ShortcutBinding[] | (() => readonly ShortcutBinding[]),
): () => void {
  const listener = (event: KeyEventLike) => {
    if (shouldIgnoreKey(event)) return;
    const list = typeof bindings === "function" ? bindings() : bindings;
    const match = matchShortcut(list, event);
    if (!match) return;
    event.preventDefault();
    try {
      match.run();
    } catch (e) {
      console.error(`[shortcuts] "${match.key}" failed:`, e);
    }
  };
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
