/**
 * The panels whose window has to go: hidden in the Panels menu just now while
 * living in a window of their own. A docked panel has no window to close.
 */
export function panelsToClose<Id extends string>(
  ids: readonly Id[],
  previous: Readonly<Record<string, boolean>>,
  next: Readonly<Record<string, boolean>>,
  detached: Readonly<Partial<Record<string, boolean>>>,
): Id[] {
  return ids.filter((id) => previous[id] !== false && next[id] === false && detached[id] === true);
}
