import { describe, it, expect } from "vitest";
import { audibleTakes, type TakeAudibility } from "./audibility";

const base: TakeAudibility = {
  shown: ["a", "b", "c"],
  active: "b",
  playback: "all",
  muted: [],
  recording: false,
  muteWhileRecording: true,
};
const of = (over: Partial<TakeAudibility>) => audibleTakes({ ...base, ...over });

describe("audibleTakes, all shown takes together", () => {
  it("plays every shown take, in the order they were shown", () => {
    expect(of({})).toEqual(["a", "b", "c"]);
  });

  it("leaves out the takes the user muted on their lane", () => {
    expect(of({ muted: ["a", "c"] })).toEqual(["b"]);
  });

  it("does not depend on which take is the selected one", () => {
    expect(of({ active: null })).toEqual(["a", "b", "c"]);
    expect(of({ active: "c" })).toEqual(["a", "b", "c"]);
  });

  it("ignores muted ids that are not shown", () => {
    expect(of({ muted: ["zzz"] })).toEqual(["a", "b", "c"]);
  });

  it("plays nothing when nothing is shown", () => {
    expect(of({ shown: [], active: null })).toEqual([]);
  });
});

describe("audibleTakes, selected take only", () => {
  it("plays just the selected take", () => {
    expect(of({ playback: "selected" })).toEqual(["b"]);
  });

  it("plays nothing when no take is selected", () => {
    expect(of({ playback: "selected", active: null })).toEqual([]);
  });

  it("plays nothing when the selected take is not among the shown ones", () => {
    expect(of({ playback: "selected", active: "ghost" })).toEqual([]);
  });

  it("a mute on the selected take's lane silences it too", () => {
    expect(of({ playback: "selected", muted: ["b"] })).toEqual([]);
  });
});

describe("audibleTakes while recording", () => {
  it("silences everything when the option to mute takes while recording is on", () => {
    expect(of({ recording: true })).toEqual([]);
    expect(of({ recording: true, playback: "selected" })).toEqual([]);
  });

  it("lets the shown takes play while recording when the option is off", () => {
    expect(of({ recording: true, muteWhileRecording: false })).toEqual(["a", "b", "c"]);
  });

  it("the option has no effect when not recording", () => {
    expect(of({ recording: false, muteWhileRecording: true })).toEqual(["a", "b", "c"]);
  });

  it("per-lane mutes still apply while recording with the option off", () => {
    expect(of({ recording: true, muteWhileRecording: false, muted: ["a"] })).toEqual(["b", "c"]);
  });
});
