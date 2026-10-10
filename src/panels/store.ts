import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface PanelDef<Id extends string = string> {
  id: Id;
  label: string;
  defaultVisible: boolean;
}

export interface PanelsState<Id extends string = string> {
  panels: readonly PanelDef<Id>[];
  /** What the user has chosen, by id. A panel they never touched is absent. */
  overrides: Partial<Record<Id, boolean>>;
  /** The resolved visibility of every registered panel: override, else default. */
  visible: Record<Id, boolean>;
  setVisible: (id: Id, visible: boolean) => void;
  toggle: (id: Id) => void;
  showAll: () => void;
  hideAll: () => void;
  reset: () => void;
}

export type PanelStore<Id extends string = string> = UseBoundStore<StoreApi<PanelsState<Id>>>;

interface Options<Id extends string> {
  storageKey: string;
  panels: readonly PanelDef<Id>[];
}

function resolve<Id extends string>(
  panels: readonly PanelDef<Id>[],
  overrides: Partial<Record<Id, boolean>>,
): Record<Id, boolean> {
  const visible = {} as Record<Id, boolean>;
  for (const p of panels) visible[p.id] = overrides[p.id] ?? p.defaultVisible;
  return visible;
}

function load<Id extends string>(storageKey: string, ids: ReadonlySet<string>): Partial<Record<Id, boolean>> {
  const overrides: Partial<Record<Id, boolean>> = {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return overrides;
    const stored = (JSON.parse(raw) as { overrides?: unknown } | null)?.overrides;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return overrides;
    for (const [id, value] of Object.entries(stored)) {
      if (ids.has(id) && typeof value === "boolean") overrides[id as Id] = value;
    }
  } catch (e) {
    console.warn(`[panels] Could not load ${storageKey}:`, e);
  }
  return overrides;
}

function persist(storageKey: string, overrides: object): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ overrides }));
  } catch (e) {
    console.warn(`[panels] Could not persist ${storageKey}:`, e);
  }
}

/**
 * Which optional panels of a page the user wants to see. Headless: the app
 * decides what a panel is and how the choices are presented.
 *
 * Only explicit choices are stored, so a panel added in a later version takes
 * its default while an old choice is kept.
 */
export function createPanelStore<const Id extends string>({ storageKey, panels }: Options<Id>): PanelStore<Id> {
  if (!storageKey) throw new Error("createPanelStore needs a storageKey");
  const ids = new Set<string>();
  for (const { id } of panels) {
    if (!id) throw new Error("createPanelStore: a panel has an empty id");
    if (ids.has(id)) throw new Error(`createPanelStore: duplicate panel id "${id}"`);
    ids.add(id);
  }

  const initial = load<Id>(storageKey, ids);

  return create<PanelsState<Id>>((set, get) => {
    const commit = (overrides: Partial<Record<Id, boolean>>) => {
      set({ overrides, visible: resolve(panels, overrides) });
      persist(storageKey, overrides);
    };
    function known(id: string): asserts id is Id {
      if (!ids.has(id)) throw new Error(`Unknown panel "${id}"`);
    }
    const setAll = (value: boolean) => {
      const overrides: Partial<Record<Id, boolean>> = {};
      for (const p of panels) overrides[p.id] = value;
      commit(overrides);
    };

    return {
      panels,
      overrides: initial,
      visible: resolve(panels, initial),

      setVisible: (id, visible) => {
        known(id);
        commit({ ...get().overrides, [id]: visible });
      },
      toggle: (id) => {
        known(id);
        commit({ ...get().overrides, [id]: !get().visible[id] });
      },
      showAll: () => setAll(true),
      hideAll: () => setAll(false),
      reset: () => commit({}),
    };
  });
}
