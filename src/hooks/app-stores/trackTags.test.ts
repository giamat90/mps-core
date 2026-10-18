import { describe, it, expect } from "vitest";
import { hiddenTrackTags } from "./trackTags";

const ids = ["vocals", "drums", "bass"] as const;

describe("hiddenTrackTags", () => {
  it("tags nothing while every track is shown", () => {
    expect(hiddenTrackTags({ vocals: true, drums: true, bass: true }, ids, { muted: { vocals: true }, soloed: "drums" })).toEqual({});
  });

  it("says a minimized track is muted, or soloed", () => {
    const visible = { vocals: false, drums: false, bass: true };
    expect(hiddenTrackTags(visible, ids, { muted: { vocals: true }, soloed: null })).toEqual({ vocals: "muted" });
    expect(hiddenTrackTags(visible, ids, { muted: {}, soloed: "drums" })).toEqual({ drums: "solo" });
  });

  it("prefers solo over muted for the same track", () => {
    expect(hiddenTrackTags({ vocals: false }, ["vocals"], { muted: { vocals: true }, soloed: "vocals" })).toEqual({ vocals: "solo" });
  });

  it("treats a track with no visibility entry as hidden, and ignores tracks not asked about", () => {
    expect(hiddenTrackTags({}, ["vocals"], { muted: { vocals: true, drums: true }, soloed: null })).toEqual({ vocals: "muted" });
  });

  it("leaves an unmuted, unsoloed minimized track untagged", () => {
    expect(hiddenTrackTags({ vocals: false }, ["vocals"], { muted: {}, soloed: null })).toEqual({});
  });
});
