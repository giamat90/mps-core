import { useId } from "react";
import { create } from "zustand";
import type { PanelDef, PanelStore } from "../../panels";
import { usePopover, type Popover } from "./usePopover";

type VisibleStore = (select: (s: { visible: Record<string, boolean> }) => Record<string, boolean>) => Record<string, boolean>;

// Stands in when a menu has no fixed areas, so the store hook below is always called.
const NO_AREAS = create<{ visible: Record<string, boolean> }>(() => ({ visible: {} }));

/** An area that is hidden by collapsing it, with the tracks the user can also hide one by one. */
export interface PanelMenuItem {
  id: string;
  label: string;
  parts?: readonly { id: string; label: string }[];
}

export interface PanelMenuFixedList {
  items: readonly PanelMenuItem[];
  visible: Readonly<Record<string, boolean>>;
  /** A short note on a track, e.g. why a hidden one is silent. */
  tags?: Readonly<Partial<Record<string, string>>>;
  onToggle: (id: string) => void;
}

export interface PanelMenuListProps<Id extends string = string> {
  panels: readonly PanelDef<Id>[];
  visible: Readonly<Record<string, boolean>>;
  /** Panels that are in a window of their own. */
  detached?: Readonly<Partial<Record<string, boolean>>>;
  /** Areas listed above the panels that cannot be moved. */
  fixed?: PanelMenuFixedList;
  /** Whether the panels can be dragged: the hint about the grip is only true then. */
  movable?: boolean;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onReset: () => void;
}

export interface UsePanelMenuOptions<Id extends string, FixedId extends string> {
  store: PanelStore<Id>;
  panels: readonly PanelDef<Id>[];
  /** Areas that are collapsed, never unmounted, when hidden. They have a store of their own and are listed first. */
  fixed?: {
    store: PanelStore<FixedId>;
    items: readonly PanelMenuItem[];
    tags?: Readonly<Partial<Record<string, string>>>;
  };
  movable?: boolean;
  /** The panels that are in a window of their own, read inside the hook so the menu follows them. */
  useDetached: () => Readonly<Partial<Record<string, boolean>>>;
}

export interface PanelMenu<Id extends string> extends Popover {
  listId: string;
  /** Panels shown out of all the menu offers. */
  shown: number;
  total: number;
  list: PanelMenuListProps<Id>;
}

export function usePanelMenu<Id extends string, FixedId extends string = never>({
  store, panels, fixed, movable, useDetached,
}: UsePanelMenuOptions<Id, FixedId>): PanelMenu<Id> {
  const popover = usePopover();
  const listId = useId();
  const visible = store((s) => s.visible);
  const order = store((s) => s.order);
  const detached = useDetached();
  const { toggle, showAll, hideAll, reset } = store.getState();
  const fixedVisible = ((fixed?.store ?? NO_AREAS) as unknown as VisibleStore)((s) => s.visible);
  const fixedItems = fixed?.items ?? [];
  const shown = panels.filter((p) => visible[p.id]).length + fixedItems.filter((i) => fixedVisible[i.id]).length;
  const total = panels.length + fixedItems.length;
  const ordered = [...panels].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  return {
    ...popover,
    listId,
    shown,
    total,
    list: {
      panels: ordered,
      visible,
      detached,
      movable,
      fixed: fixed && {
        items: fixed.items,
        visible: fixedVisible,
        tags: fixed.tags,
        onToggle: (id) => fixed.store.getState().toggle(id as FixedId),
      },
      onToggle: (id) => toggle(id as Id),
      onShowAll: () => {
        showAll();
        fixed?.store.getState().showAll();
      },
      onHideAll: () => {
        hideAll();
        // Only the areas go: the user's choice of tracks inside them comes back with them.
        for (const item of fixedItems) fixed?.store.getState().setVisible(item.id as FixedId, false);
      },
      onReset: () => {
        reset();
        fixed?.store.getState().reset();
      },
    },
  };
}
