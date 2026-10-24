import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface CollapseState {
  /** Ids the user has collapsed. A panel never touched is absent, so it is open. */
  collapsed: Readonly<Record<string, true>>;
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  setCollapsed: (id: string, collapsed: boolean) => void;
}

export type CollapseStore = UseBoundStore<StoreApi<CollapseState>>;

function load(storageKey: string): Record<string, true> {
  const result: Record<string, true> = {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return result;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === "string" && id) result[id] = true;
    }
  } catch (e) {
    console.warn(`[panels] Could not load ${storageKey}:`, e);
  }
  return result;
}

function persist(storageKey: string, collapsed: Readonly<Record<string, true>>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.keys(collapsed)));
  } catch (e) {
    console.warn(`[panels] Could not persist ${storageKey}:`, e);
  }
}

/**
 * Which panels the user has folded down to their title. Headless and separate
 * from the visibility store: a component does not know which page shows it, so
 * the choice is keyed by the panel's own id and shared by every page that draws
 * it. Only collapsed panels are stored; everything else stays open.
 *
 * A panel in a window of its own is another webview on the same storage, so the
 * store re-reads when that window writes.
 */
export function createCollapseStore({ storageKey }: { storageKey: string }): CollapseStore {
  if (!storageKey) throw new Error("createCollapseStore needs a storageKey");

  const store = create<CollapseState>((set, get) => {
    const commit = (collapsed: Record<string, true>) => {
      set({ collapsed });
      persist(storageKey, collapsed);
    };
    const setCollapsed = (id: string, folded: boolean) => {
      if (!id) throw new Error("createCollapseStore: a panel has an empty id");
      const already = get().collapsed[id] === true;
      if (already === folded) return;
      const next = { ...get().collapsed };
      if (folded) next[id] = true;
      else delete next[id];
      commit(next);
    };
    return {
      collapsed: load(storageKey),
      isCollapsed: (id) => get().collapsed[id] === true,
      toggle: (id) => setCollapsed(id, get().collapsed[id] !== true),
      setCollapsed,
    };
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => {
      if (e.key === storageKey || e.key === null) store.setState({ collapsed: load(storageKey) });
    });
  }

  return store;
}
