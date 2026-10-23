import type { CollapseStore } from "../../panels";

export interface CollapsiblePanel {
  /** False when the user has folded the panel down to its title. */
  open: boolean;
  toggle: () => void;
  /** What the title button takes: it folds and unfolds the panel and tells assistive technology which it is. */
  buttonProps: {
    type: "button";
    onClick: () => void;
    "aria-expanded": boolean;
  };
}

/**
 * The state behind a panel whose title is a button that folds it. The panel
 * renders its body only while `open`, so a folded panel runs no drawing loop.
 */
export function useCollapsiblePanel(store: CollapseStore, id: string): CollapsiblePanel {
  const open = store((s) => s.collapsed[id] !== true);
  const toggle = () => store.getState().toggle(id);
  return { open, toggle, buttonProps: { type: "button", onClick: toggle, "aria-expanded": open } };
}
