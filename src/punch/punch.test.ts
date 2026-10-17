import { describe, it, expect } from "vitest";
import {
  MIN_HANDLE_GAP_S,
  MIN_REGION_S,
  finishPunchDrag,
  grabPunchEdge,
  startPunchDrag,
  updatePunchPreview,
} from "./punch";

describe("grabPunchEdge", () => {
  it("starts a new region when there is none", () => {
    expect(grabPunchEdge(100, null, null, 8)).toBe("create");
    expect(grabPunchEdge(100, 100, null, 8)).toBe("create");
    expect(grabPunchEdge(100, null, 100, 8)).toBe("create");
  });

  it("grabs the edge the press lands on, within the hit distance on either side", () => {
    expect(grabPunchEdge(102, 100, 400, 8)).toBe("drag-in");
    expect(grabPunchEdge(92, 100, 400, 8)).toBe("drag-in");
    expect(grabPunchEdge(406, 100, 400, 8)).toBe("drag-out");
    expect(grabPunchEdge(408, 100, 400, 8)).toBe("drag-out");
  });

  it("starts a new region anywhere else", () => {
    expect(grabPunchEdge(250, 100, 400, 8)).toBe("create");
    expect(grabPunchEdge(91, 100, 400, 8)).toBe("create");
  });

  it("prefers the in edge when both are under the pointer", () => {
    expect(grabPunchEdge(100, 100, 104, 8)).toBe("drag-in");
  });
});

describe("startPunchDrag", () => {
  it("anchors a new region at the press and previews it as empty", () => {
    expect(startPunchDrag("create", 12.5, null, null)).toEqual({
      drag: { mode: "create", anchorT: 12.5 },
      preview: { inT: 12.5, outT: 12.5 },
    });
  });

  it("anchors the opposite edge when an edge is grabbed", () => {
    expect(startPunchDrag("drag-in", 9, 10, 20)).toEqual({
      drag: { mode: "drag-in", anchorT: 20 },
      preview: { inT: 9, outT: 20 },
    });
    expect(startPunchDrag("drag-out", 21, 10, 20)).toEqual({
      drag: { mode: "drag-out", anchorT: 10 },
      preview: { inT: 10, outT: 21 },
    });
  });

  it("falls back to a new region if an edge is asked for but there is no region", () => {
    expect(startPunchDrag("drag-in", 5, null, null).drag).toEqual({ mode: "create", anchorT: 5 });
    expect(startPunchDrag("drag-out", 5, 1, null).drag).toEqual({ mode: "create", anchorT: 5 });
  });
});

describe("updatePunchPreview", () => {
  it("orders a new region whichever way it is dragged", () => {
    const drag = { mode: "create", anchorT: 10 } as const;
    expect(updatePunchPreview(drag, 14)).toEqual({ inT: 10, outT: 14 });
    expect(updatePunchPreview(drag, 6)).toEqual({ inT: 6, outT: 10 });
  });

  it("keeps the in edge a gap before the out edge", () => {
    const drag = { mode: "drag-in", anchorT: 20 } as const;
    expect(updatePunchPreview(drag, 15)).toEqual({ inT: 15, outT: 20 });
    expect(updatePunchPreview(drag, 25).inT).toBeCloseTo(20 - MIN_HANDLE_GAP_S, 9);
    expect(updatePunchPreview(drag, 25).outT).toBe(20);
  });

  it("keeps the out edge a gap after the in edge", () => {
    const drag = { mode: "drag-out", anchorT: 10 } as const;
    expect(updatePunchPreview(drag, 15)).toEqual({ inT: 10, outT: 15 });
    expect(updatePunchPreview(drag, 5).outT).toBeCloseTo(10 + MIN_HANDLE_GAP_S, 9);
    expect(updatePunchPreview(drag, 5).inT).toBe(10);
  });
});

describe("finishPunchDrag", () => {
  it("commits a moved in edge, rounded to a tenth and held a gap from the out edge", () => {
    expect(finishPunchDrag({ mode: "drag-in", anchorT: 20 }, 12.34)).toEqual({ type: "in", t: 12.3 });
    expect(finishPunchDrag({ mode: "drag-in", anchorT: 20 }, 30)).toEqual({ type: "in", t: 19.9 });
  });

  it("commits a moved out edge, rounded to a tenth and held a gap from the in edge", () => {
    expect(finishPunchDrag({ mode: "drag-out", anchorT: 10 }, 15.66)).toEqual({ type: "out", t: 15.7 });
    expect(finishPunchDrag({ mode: "drag-out", anchorT: 10 }, 2)).toEqual({ type: "out", t: 10.1 });
  });

  it("commits a dragged-out region in order, rounded to tenths", () => {
    expect(finishPunchDrag({ mode: "create", anchorT: 10.04 }, 14.06)).toEqual({ type: "range", inT: 10, outT: 14.1 });
    expect(finishPunchDrag({ mode: "create", anchorT: 14 }, 10)).toEqual({ type: "range", inT: 10, outT: 14 });
  });

  it("treats a drag narrower than the minimum region as a click that clears", () => {
    expect(finishPunchDrag({ mode: "create", anchorT: 10 }, 10)).toEqual({ type: "clear" });
    expect(finishPunchDrag({ mode: "create", anchorT: 10 }, 10 + MIN_REGION_S - 0.01)).toEqual({ type: "clear" });
    expect(finishPunchDrag({ mode: "create", anchorT: 10 }, 10 + MIN_REGION_S).type).toBe("range");
  });
});
