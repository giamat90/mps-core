/**
 * Which recorded takes are on screen and which of them is heard.
 *
 * `shown` is ordered by when each take was shown; `active` is always one of
 * them (or null when nothing is shown). The active take is the audible one and
 * the one the app analyses; the other shown takes keep their lane so the user
 * can switch between them while playing.
 */
export interface TakeSelection {
  readonly shown: readonly string[];
  readonly active: string | null;
}

export const EMPTY_SELECTION: TakeSelection = { shown: [], active: null };

const lastOf = (ids: readonly string[]): string | null => (ids.length > 0 ? ids[ids.length - 1] : null);

/** Clicking a take: show it, switch to it, or (when it is the active one) hide it. */
export function toggleTake(sel: TakeSelection, id: string): TakeSelection {
  if (!sel.shown.includes(id)) return { shown: [...sel.shown, id], active: id };
  if (sel.active === id) return hideTake(sel, id);
  return { shown: sel.shown, active: id };
}

/** Make sure a take is shown and heard (a take that was just recorded). */
export function showTake(sel: TakeSelection, id: string): TakeSelection {
  return { shown: sel.shown.includes(id) ? sel.shown : [...sel.shown, id], active: id };
}

export function hideTake(sel: TakeSelection, id: string): TakeSelection {
  if (!sel.shown.includes(id)) return sel;
  const shown = sel.shown.filter((s) => s !== id);
  return { shown, active: sel.active === id ? lastOf(shown) : sel.active };
}

/** After takes were deleted or reloaded: keep only what still exists and repair `active`. */
export function reconcileTakes(sel: TakeSelection, existing: readonly string[]): TakeSelection {
  const known = new Set(existing);
  const shown = sel.shown.filter((id) => known.has(id));
  const active = sel.active !== null && shown.includes(sel.active) ? sel.active : lastOf(shown);
  if (shown.length === sel.shown.length && active === sel.active) return sel;
  return { shown, active };
}
