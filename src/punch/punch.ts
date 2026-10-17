/**
 * The punch region: the span of the song the user records over or loops. Both
 * apps let the user drag it out on a ruler; what differs between rulers is how a
 * pixel maps to a time. This module is the part that does not: which edge a
 * drag moves, the live preview while dragging, and what is committed on release.
 */

export type PunchMode = "create" | "drag-in" | "drag-out";

/**
 * A drag in progress. `anchorT` is the end that stays put: the new region's
 * first corner when creating, the opposite edge when moving one edge.
 */
export interface PunchDrag {
  mode: PunchMode;
  anchorT: number;
}

/** The region as drawn while dragging; nothing reaches a store until release. */
export interface PunchPreview {
  inT: number | null;
  outT: number | null;
}

export type PunchCommit =
  | { type: "in"; t: number }
  | { type: "out"; t: number }
  | { type: "range"; inT: number; outT: number }
  | { type: "clear" };

/** An edge cannot be dragged closer than this to the other one. */
export const MIN_HANDLE_GAP_S = 0.1;
/** A region dragged out narrower than this is a click, which clears the region. */
export const MIN_REGION_S = 0.5;

const roundTenth = (v: number): number => Math.round(v * 10) / 10;

/**
 * Which edge a press at `x` grabs. `xIn` and `xOut` are the edges' pixel
 * positions on this ruler, or null when there is no region; `hit` is how close
 * counts as grabbing. Anything else starts a new region.
 */
export function grabPunchEdge(x: number, xIn: number | null, xOut: number | null, hit: number): PunchMode {
  if (xIn === null || xOut === null) return "create";
  if (Math.abs(x - xIn) <= hit) return "drag-in";
  if (Math.abs(x - xOut) <= hit) return "drag-out";
  return "create";
}

/** The drag that a press at time `t` starts in `mode`, given the region as it is now. */
export function startPunchDrag(
  mode: PunchMode,
  t: number,
  punchIn: number | null,
  punchOut: number | null,
): { drag: PunchDrag; preview: PunchPreview } {
  if (mode === "drag-in" && punchIn !== null && punchOut !== null) {
    return { drag: { mode, anchorT: punchOut }, preview: { inT: t, outT: punchOut } };
  }
  if (mode === "drag-out" && punchIn !== null && punchOut !== null) {
    return { drag: { mode, anchorT: punchIn }, preview: { inT: punchIn, outT: t } };
  }
  return { drag: { mode: "create", anchorT: t }, preview: { inT: t, outT: t } };
}

export function updatePunchPreview(drag: PunchDrag, t: number): PunchPreview {
  const { mode, anchorT } = drag;
  if (mode === "create") return { inT: Math.min(anchorT, t), outT: Math.max(anchorT, t) };
  if (mode === "drag-in") return { inT: Math.min(t, anchorT - MIN_HANDLE_GAP_S), outT: anchorT };
  return { inT: anchorT, outT: Math.max(t, anchorT + MIN_HANDLE_GAP_S) };
}

/** What the release at time `t` commits, rounded to a tenth of a second. */
export function finishPunchDrag(drag: PunchDrag, t: number): PunchCommit {
  const { mode, anchorT } = drag;
  if (mode === "drag-in") return { type: "in", t: roundTenth(Math.min(t, anchorT - MIN_HANDLE_GAP_S)) };
  if (mode === "drag-out") return { type: "out", t: roundTenth(Math.max(t, anchorT + MIN_HANDLE_GAP_S)) };
  const inT = Math.min(anchorT, t);
  const outT = Math.max(anchorT, t);
  if (outT - inT < MIN_REGION_S) return { type: "clear" };
  return { type: "range", inT: roundTenth(inT), outT: roundTenth(outT) };
}
