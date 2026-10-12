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
  /** Every registered panel in the order the user wants them stacked: theirs, else the registered one. */
  order: readonly Id[];
  setVisible: (id: Id, visible: boolean) => void;
  toggle: (id: Id) => void;
  showAll: () => void;
  hideAll: () => void;
  /** Puts `id` where `overId` is now: a panel dropped lower lands after it, one dropped higher lands before it. */
  move: (id: Id, overId: Id) => void;
  resetOrder: () => void;
  /** Visibility and order back to the defaults. */
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

interface Stored<Id extends string> {
  overrides: Partial<Record<Id, boolean>>;
  order: Id[] | null;
}

function load<Id extends string>(storageKey: string, ids: ReadonlySet<string>): Stored<Id> {
  const result: Stored<Id> = { overrides: {}, order: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return result;
    const parsed = JSON.parse(raw) as { overrides?: unknown; order?: unknown } | null;
    const { overrides, order } = parsed ?? {};
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      for (const [id, value] of Object.entries(overrides)) {
        if (ids.has(id) && typeof value === "boolean") result.overrides[id as Id] = value;
      }
    }
    if (Array.isArray(order)) {
      const known = [...new Set(order.filter((id): id is Id => typeof id === "string" && ids.has(id)))];
      if (known.length > 0) result.order = known;
    }
  } catch (e) {
    console.warn(`[panels] Could not load ${storageKey}:`, e);
  }
  return result;
}

function persist<Id extends string>(storageKey: string, { overrides, order }: Stored<Id>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(order ? { overrides, order } : { overrides }));
  } catch (e) {
    console.warn(`[panels] Could not persist ${storageKey}:`, e);
  }
}

/** The user's order with any panel they have never seen slotted in after the panel that precedes it by default. */
function resolveOrder<Id extends string>(panels: readonly PanelDef<Id>[], custom: readonly Id[] | null): Id[] {
  if (!custom) return panels.map((p) => p.id);
  const order = [...custom];
  panels.forEach((p, i) => {
    if (order.includes(p.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = order.indexOf(panels[j].id);
      if (before !== -1) {
        at = before + 1;
        break;
      }
    }
    order.splice(at, 0, p.id);
  });
  return order;
}

/**
 * Which optional panels of a page the user wants to see. Headless: the app
 * decides what a panel is and how the choices are presented.
 *
 * Only explicit choices are stored, so a panel added in a later version takes
 * its default (visibility, and a place next to its default neighbour) while an
 * old choice is kept.
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
    let customOrder = initial.order;

    const save = (overrides: Partial<Record<Id, boolean>>) => persist(storageKey, { overrides, order: customOrder });
    const commit = (overrides: Partial<Record<Id, boolean>>) => {
      set({ overrides, visible: resolve(panels, overrides) });
      save(overrides);
    };
    function known(id: string): asserts id is Id {
      if (!ids.has(id)) throw new Error(`Unknown panel "${id}"`);
    }
    const setAll = (value: boolean) => {
      const overrides: Partial<Record<Id, boolean>> = {};
      for (const p of panels) overrides[p.id] = value;
      commit(overrides);
    };
    const setOrder = (custom: Id[] | null) => {
      customOrder = custom;
      set({ order: resolveOrder(panels, custom) });
    };

    return {
      panels,
      overrides: initial.overrides,
      visible: resolve(panels, initial.overrides),
      order: resolveOrder(panels, initial.order),

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
      move: (id, overId) => {
        known(id);
        known(overId);
        if (id === overId) return;
        const order = [...get().order];
        order.splice(order.indexOf(id), 1);
        order.splice(get().order.indexOf(overId), 0, id);
        setOrder(order);
        save(get().overrides);
      },
      resetOrder: () => {
        setOrder(null);
        save(get().overrides);
      },
      reset: () => {
        setOrder(null);
        commit({});
      },
    };
  });
}
