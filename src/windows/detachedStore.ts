import { create, type StoreApi, type UseBoundStore } from "zustand";

export interface DetachedState<Id extends string> {
  /** Panels currently shown in a window of their own. Never persisted: every session starts docked. */
  detached: Partial<Record<Id, boolean>>;
  markDetached: (panel: Id) => void;
  markDocked: (panel: string) => void;
  reset: () => void;
}

export type DetachedStore<Id extends string> = UseBoundStore<StoreApi<DetachedState<Id>>>;

export function createDetachedStore<Id extends string>(isPanel: (value: unknown) => value is Id): DetachedStore<Id> {
  return create<DetachedState<Id>>((set) => ({
    detached: {},

    markDetached: (panel) => set((s) => ({ detached: { ...s.detached, [panel]: true } })),

    markDocked: (panel) => {
      if (!isPanel(panel)) return;
      set((s) => {
        const { [panel]: _gone, ...rest } = s.detached;
        return { detached: rest as Partial<Record<Id, boolean>> };
      });
    },

    reset: () => set({ detached: {} }),
  }));
}
