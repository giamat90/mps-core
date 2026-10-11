import { describe, it, expect } from "vitest";
import { audibleTakes, takeSilence, type TakeAudibility } from "./audibility";

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

describe("audibleTakes with a take soloed", () => {
  it("plays only the soloed take", () => {
    expect(of({ soloed: "c" })).toEqual(["c"]);
  });

  it("the solo wins over the mode and over a mute", () => {
    expect(of({ soloed: "a", playback: "selected", muted: ["a"] })).toEqual(["a"]);
  });

  it("ignores a solo on a take that is not shown", () => {
    expect(of({ soloed: "ghost" })).toEqual(["a", "b", "c"]);
    expect(of({ soloed: null })).toEqual(["a", "b", "c"]);
  });

  it("is still silent while recording when takes are muted then", () => {
    expect(of({ soloed: "a", recording: true })).toEqual([]);
    expect(of({ soloed: "a", recording: true, muteWhileRecording: false })).toEqual(["a"]);
  });
});

describe("audibleTakes when the takes as a whole are silenced", () => {
  it("plays nothing, whatever the lanes say", () => {
    expect(of({ silenced: true })).toEqual([]);
    expect(of({ silenced: true, soloed: "a" })).toEqual([]);
    expect(of({ silenced: true, playback: "selected" })).toEqual([]);
  });

  it("changes nothing while it is off", () => {
    expect(of({ silenced: false, soloed: "c" })).toEqual(["c"]);
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

describe("takeSilence", () => {
  const why = (id: string, over: Partial<TakeAudibility> = {}) => takeSilence({ ...base, ...over }, id);

  it("is null for a take that is heard", () => {
    expect(why("a")).toBeNull();
  });

  it("says a take that is not shown is hidden", () => {
    expect(why("zzz")).toBe("hidden");
  });

  it("names the lane mute", () => {
    expect(why("a", { muted: ["a"] })).toBe("muted");
  });

  it("names selected-only mode for the takes that are not the selected one, and not for the selected one", () => {
    expect(why("a", { playback: "selected" })).toBe("not-selected");
    expect(why("b", { playback: "selected" })).toBeNull();
  });

  it("names a muted selected take in selected-only mode, which is the case that looks like the others", () => {
    expect(why("b", { playback: "selected", muted: ["b"] })).toBe("muted");
    expect(why("a", { playback: "selected", muted: ["b"] })).toBe("not-selected");
  });

  it("names another take's solo, and is null for the soloed one even if it was muted", () => {
    expect(why("a", { soloed: "c" })).toBe("soloed-other");
    expect(why("c", { soloed: "c", muted: ["c"] })).toBeNull();
  });

  it("names the recording mute", () => {
    expect(why("a", { recording: true })).toBe("recording");
    expect(why("a", { recording: true, muteWhileRecording: false })).toBeNull();
  });

  it("puts the main take mute first, then recording, then solo, then the lane mute", () => {
    expect(why("a", { silenced: true, recording: true, soloed: "c", muted: ["a"] })).toBe("channel");
    expect(why("a", { recording: true, soloed: "c", muted: ["a"] })).toBe("recording");
    expect(why("a", { soloed: "c", muted: ["a"] })).toBe("soloed-other");
  });

  it("agrees with audibleTakes for every combination", () => {
    const modes = ["all", "selected"] as const;
    for (const playback of modes) for (const recording of [false, true]) for (const silenced of [false, true])
      for (const muted of [[], ["a"], ["b"]]) for (const soloed of [null, "a", "c"]) {
        const a = { ...base, playback, recording, silenced, muted, soloed };
        const heard = audibleTakes(a);
        for (const id of base.shown) expect(takeSilence(a, id) === null).toBe(heard.includes(id));
      }
  });
});
