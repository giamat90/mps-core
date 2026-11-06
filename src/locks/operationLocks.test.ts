import { describe, it, expect } from "vitest";
import { operationLocks, type BusyState, type OperationLocks } from "./index";

const blocked = (s: BusyState): (keyof OperationLocks)[] =>
  (Object.entries(operationLocks(s)) as [keyof OperationLocks, string | null][]).filter(([, v]) => v !== null).map(([k]) => k);

describe("operationLocks", () => {
  it("blocks nothing when idle", () => {
    expect(blocked({})).toEqual([]);
  });

  it("while transposing: no playback, record, monitor, second transpose, export or leaving; takes stay editable", () => {
    expect(blocked({ isTransposing: true })).toEqual(["playback", "record", "monitor", "transpose", "exportAudio", "leave"]);
  });

  it("while loading the song: no playback, record, monitor, transpose or export; leaving is allowed", () => {
    expect(blocked({ isLoadingSong: true })).toEqual(["playback", "record", "monitor", "transpose", "exportAudio"]);
  });

  it("while a take is analyzing: no new recording, transpose, take edits or leaving; playback stays free", () => {
    expect(blocked({ isSavingTake: true })).toEqual(["record", "transpose", "takeEdit", "leave"]);
  });

  it("while recording: no transpose, take edits or leaving; Stop and Pause stay possible", () => {
    expect(blocked({ isRecording: true })).toEqual(["transpose", "takeEdit", "leave"]);
  });

  it("while monitoring or counting in: no transpose, nothing else", () => {
    expect(blocked({ isMonitoring: true })).toEqual(["transpose"]);
    expect(blocked({ isCountingIn: true })).toEqual(["transpose"]);
  });

  it("gives the reason of the most urgent cause", () => {
    expect(operationLocks({ isTransposing: true, isRecording: true }).transpose).toBe("Wait for the transpose to finish");
    expect(operationLocks({ isRecording: true }).transpose).toBe("Stop recording first");
    expect(operationLocks({ isMonitoring: true }).transpose).toBe("Stop monitoring first");
    expect(operationLocks({ isCountingIn: true }).transpose).toBe("Wait for the count-in");
    expect(operationLocks({ isLoadingSong: true, isTransposing: true }).playback).toBe("The song is still loading");
  });
});
