// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { FIRST_CLICK_S, INTERVAL_S, N_COUNTIN, N_MEASURED } from "./clapLatency";
import {
  pickLoudestChannel,
  useLatencyCalibration,
  type CalibrationMessages,
  type LatencyCalibrationOptions,
  type LatencyCalibrationState,
} from "./latencyCalibration";

const RECORDING_S = FIRST_CLICK_S + (N_COUNTIN + N_MEASURED - 1) * INTERVAL_S + 1.5;
const SR = 16000;
const messages: CalibrationMessages = { inputUnavailable: "Input unavailable: ", noSignal: "no signal", rejected: "rejected" };

function claps(count: number, delayMs: number): Float32Array {
  const x = new Float32Array(Math.round(RECORDING_S * SR));
  for (let k = 0; k < count; k++) {
    const at = Math.round((((FIRST_CLICK_S + (N_COUNTIN + k) * INTERVAL_S) * 1000 + delayMs) * SR) / 1000);
    for (let i = 0; i < 400 && at + i < x.length; i++) x[at + i] += 0.6 * Math.exp(-i / 80) * Math.sin(i * 0.9);
  }
  return x;
}

const buffer = (channels: Float32Array[]) =>
  ({ numberOfChannels: channels.length, sampleRate: SR, getChannelData: (c: number) => channels[c] }) as unknown as AudioBuffer;

describe("pickLoudestChannel", () => {
  it("takes the channel with the highest peak, not channel 0", () => {
    const quiet = new Float32Array([0.01, 0.02]);
    const loud = new Float32Array([0.1, -0.9]);
    expect(pickLoudestChannel(buffer([quiet, loud]))).toBe(loud);
    expect(pickLoudestChannel(buffer([loud, quiet]))).toBe(loud);
  });

  it("falls back to channel 0 for pure silence", () => {
    const a = new Float32Array(4);
    expect(pickLoudestChannel(buffer([a, new Float32Array(4)]))).toBe(a);
  });
});

describe("useLatencyCalibration", () => {
  let state: LatencyCalibrationState;
  let audioContexts: Array<{ opts?: AudioContextOptions; close: Mock<() => Promise<void>> }>;
  let recorder: { state: string; mimeType: string; start: Mock<() => void>; stop: Mock<() => void>; ondataavailable?: (e: { data: Blob }) => void; onstop?: () => void; onerror?: unknown };
  let decoded: AudioBuffer | Error;
  let getUserMedia: Mock<() => Promise<unknown>>;
  let trackStop: Mock<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    decoded = buffer([claps(N_MEASURED, 120)]);
    audioContexts = [];
    trackStop = vi.fn<() => void>();
    getUserMedia = vi.fn<() => Promise<unknown>>().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    recorder = {
      state: "inactive",
      mimeType: "audio/webm",
      start: vi.fn<() => void>(() => { recorder.state = "recording"; }),
      stop: vi.fn<() => void>(() => { recorder.state = "inactive"; recorder.onstop?.(); }),
    };
    const MR = vi.fn(function () { return recorder; }) as unknown as typeof MediaRecorder;
    (MR as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported = () => true;
    vi.stubGlobal("MediaRecorder", MR);
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      constructor(public opts?: AudioContextOptions) { audioContexts.push(this); }
      createOscillator() { return { connect() {}, frequency: { value: 0 }, start() {}, stop() {} }; }
      createGain() {
        return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } };
      }
      decodeAudioData() { return decoded instanceof Error ? Promise.reject(decoded) : Promise.resolve(decoded); }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("Blob", class { constructor(public parts: unknown[], public opts?: unknown) {} arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); } size = 1 });
    state = {
      audioDevices: [{ deviceId: "m1", label: "Mic One (USB)" }],
      selectedDeviceId: "m1",
      selectedOutputDeviceId: "out1",
      recordingOffsets: {},
      setRecordingOffset: vi.fn(),
      applyCalibration: vi.fn(),
      fetchAudioDevices: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const setup = (over: Partial<LatencyCalibrationOptions> = {}) =>
    renderHook(() => useLatencyCalibration({ useStore: (sel) => sel(state), messages, followOutputDevice: true, ...over }));

  async function runToEnd() {
    await act(async () => { await vi.advanceTimersByTimeAsync(RECORDING_S * 1000 + 100); });
  }

  it("loads the devices on mount and lists the default input first", () => {
    const { result } = setup();
    expect(state.fetchAudioDevices).toHaveBeenCalledTimes(1);
    expect(result.current.devices.map((d) => d.deviceId)).toEqual(["", "m1"]);
    expect(result.current.micDeviceId).toBe("m1");
    expect(result.current.phase).toBe("idle");
    expect(result.current.isActive).toBe(false);
  });

  it("counts in, measures, analyses and offers the result", async () => {
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    expect(result.current.phase).toBe("counting");
    expect(result.current.countdown).toBe(N_COUNTIN);
    expect(result.current.isActive).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync((FIRST_CLICK_S + (N_COUNTIN - 1) * INTERVAL_S) * 1000 + 10); });
    expect(result.current.countdown).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVAL_S * 1000 * 3); });
    expect(result.current.phase).toBe("measuring");
    expect(result.current.measuredCount).toBe(3);

    await runToEnd();
    expect(result.current.phase).toBe("done");
    expect(Math.abs(result.current.result!.medianMs - 120)).toBeLessThanOrEqual(3);
    expect(trackStop).toHaveBeenCalled();
  });

  it("applies the result to the measured device with the output it used", async () => {
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    await runToEnd();
    act(() => result.current.apply());
    expect(state.applyCalibration).toHaveBeenCalledWith("m1", expect.objectContaining({ outputDeviceId: "out1", madMs: expect.any(Number) }));
    expect(result.current.phase).toBe("idle");
    expect(audioContexts[0].opts).toEqual({ sinkId: "out1" });
  });

  it("ignores the output device when not asked to follow it", async () => {
    const { result } = setup({ followOutputDevice: false });
    await act(async () => { await result.current.start("m1"); });
    await runToEnd();
    act(() => result.current.apply());
    expect(audioContexts[0].opts).toBeUndefined();
    expect((state.applyCalibration as Mock).mock.calls[0][1]).not.toHaveProperty("outputDeviceId");
  });

  it("applies nothing when there is no result, and discards on dismiss", () => {
    const { result } = setup();
    act(() => result.current.apply());
    expect(state.applyCalibration).not.toHaveBeenCalled();
    act(() => result.current.dismiss());
    expect(result.current.phase).toBe("idle");
  });

  it("asks for the default input with an empty device id, and a specific one exactly", async () => {
    const { result } = setup();
    await act(async () => { await result.current.start(""); });
    expect((getUserMedia.mock.calls[0] as unknown[])[0]).toMatchObject({ audio: { echoCancellation: { exact: false } } });
    expect(JSON.stringify(getUserMedia.mock.calls[0])).not.toContain("deviceId");
    act(() => result.current.cancel());
    await act(async () => { await result.current.start("m1"); });
    expect(JSON.stringify(getUserMedia.mock.calls[1])).toContain('"deviceId":{"exact":"m1"}');
  });

  it("reports an unavailable input with the reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUserMedia.mockRejectedValue(new Error("denied"));
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    expect(result.current.phase).toBe("error");
    expect(result.current.errorMsg).toBe("Input unavailable: denied");
  });

  it("reports silence as no signal", async () => {
    decoded = buffer([new Float32Array(Math.round(RECORDING_S * SR))]);
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    await runToEnd();
    expect(result.current).toMatchObject({ phase: "error", errorMsg: "no signal" });
  });

  it("rejects too few detections", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    decoded = buffer([claps(3, 100)]);
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    await runToEnd();
    expect(result.current).toMatchObject({ phase: "error", errorMsg: "rejected" });
  });

  it("reports a decoding failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    decoded = new Error("bad data");
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    await runToEnd();
    expect(result.current.errorMsg).toBe("Analysis failed: bad data");
  });

  it("stops everything when cancelled and ignores the timers left over", async () => {
    const { result } = setup();
    await act(async () => { await result.current.start("m1"); });
    act(() => result.current.cancel());
    expect(recorder.stop).toHaveBeenCalled();
    expect(audioContexts[0].close).toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    await runToEnd();
    expect(result.current.phase).toBe("idle");
  });

  it("names the target for the buttons, trimming the device's parenthesis", async () => {
    const { result } = setup();
    expect(result.current.targetName("fallback")).toBe("Default microphone");
    await act(async () => { await result.current.start("m1"); });
    expect(result.current.targetName("fallback")).toBe("Mic One");
  });

  it("stores a typed offset as an integer, 0 for junk", () => {
    const { result } = setup();
    result.current.setOffsetFromInput("m1", "42");
    result.current.setOffsetFromInput("m1", "abc");
    expect((state.setRecordingOffset as Mock).mock.calls).toEqual([["m1", 42], ["m1", 0]]);
  });
});
