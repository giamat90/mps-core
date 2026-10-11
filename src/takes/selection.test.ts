import { describe, it, expect } from "vitest";
import { EMPTY_SELECTION, hideTake, reconcileTakes, showTake, toggleTake, type TakeSelection } from "./selection";

const sel = (shown: string[], active: string | null): TakeSelection => ({ shown, active });

describe("toggleTake (a click in the takes list)", () => {
  it("shows a take that is not shown, and makes it the one you hear", () => {
    expect(toggleTake(EMPTY_SELECTION, "a")).toEqual(sel(["a"], "a"));
  });

  it("keeps the takes already shown when another one is shown", () => {
    expect(toggleTake(sel(["a"], "a"), "b")).toEqual(sel(["a", "b"], "b"));
  });

  it("switches to a take that is shown but not the active one, without hiding anything", () => {
    expect(toggleTake(sel(["a", "b"], "b"), "a")).toEqual(sel(["a", "b"], "a"));
  });

  it("hides the active take when it is clicked again", () => {
    expect(toggleTake(sel(["a"], "a"), "a")).toEqual(EMPTY_SELECTION);
  });

  it("hands the active role to the most recently shown remaining take when the active one is hidden", () => {
    expect(toggleTake(sel(["a", "b", "c"], "c"), "c")).toEqual(sel(["a", "b"], "b"));
    expect(toggleTake(sel(["a", "b", "c"], "a"), "a")).toEqual(sel(["b", "c"], "c"));
  });

  it("does not change the input", () => {
    const input = sel(["a"], "a");
    toggleTake(input, "b");
    expect(input).toEqual(sel(["a"], "a"));
  });
});

describe("showTake (a take that has to be seen and heard, e.g. just recorded)", () => {
  it("adds it and makes it active", () => {
    expect(showTake(sel(["a"], "a"), "b")).toEqual(sel(["a", "b"], "b"));
  });

  it("only makes an already shown take active", () => {
    expect(showTake(sel(["a", "b"], "b"), "a")).toEqual(sel(["a", "b"], "a"));
  });

  it("never lists a take twice", () => {
    expect(showTake(sel(["a"], "a"), "a").shown).toEqual(["a"]);
  });
});

describe("hideTake", () => {
  it("removes a take that is shown but not active and keeps the active one", () => {
    expect(hideTake(sel(["a", "b"], "b"), "a")).toEqual(sel(["b"], "b"));
  });

  it("falls back to the most recently shown remaining take when the active one goes", () => {
    expect(hideTake(sel(["a", "b", "c"], "c"), "c")).toEqual(sel(["a", "b"], "b"));
  });

  it("leaves nothing active when nothing is left", () => {
    expect(hideTake(sel(["a"], "a"), "a")).toEqual(EMPTY_SELECTION);
  });

  it("ignores a take that is not shown", () => {
    const input = sel(["a"], "a");
    expect(hideTake(input, "zzz")).toEqual(input);
  });
});

describe("reconcileTakes (takes were deleted or reloaded)", () => {
  it("drops shown takes that no longer exist", () => {
    expect(reconcileTakes(sel(["a", "b", "c"], "b"), ["a", "c"])).toEqual(sel(["a", "c"], "c"));
  });

  it("keeps the active take when it still exists", () => {
    expect(reconcileTakes(sel(["a", "b"], "a"), ["a", "b", "z"])).toEqual(sel(["a", "b"], "a"));
  });

  it("empties the selection when none exist", () => {
    expect(reconcileTakes(sel(["a"], "a"), [])).toEqual(EMPTY_SELECTION);
  });

  it("returns the same selection object when nothing had to change", () => {
    const input = sel(["a"], "a");
    expect(reconcileTakes(input, ["a"])).toBe(input);
  });

  it("repairs an active take that is not among the shown ones", () => {
    expect(reconcileTakes(sel(["a"], "ghost"), ["a"])).toEqual(sel(["a"], "a"));
  });
});
