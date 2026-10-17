import { useEffect, useRef, useState } from "react";
import {
  FIRST_CLICK_S,
  INTERVAL_S,
  MAX_OFFSET_MS,
  MIN_DETECTED_CLAPS,
  N_COUNTIN,
  N_MEASURED,
  detectClapLatency,
  type ClapDetection,
} from "./clapLatency";
import type { StoreHook } from "./storeHook";

export type CalibrationPhase = "idle" | "counting" | "measuring" | "analyzing" | "done" | "error";

export interface AudioDeviceLike {
  deviceId: string;
  label: string;
}

export interface CalibrationOffsetEntry {
  offset: number;
  madMs?: number;
  stale?: boolean;
}

/** The slice of an app's player store the calibration reads. */
export interface LatencyCalibrationState {
  audioDevices: readonly AudioDeviceLike[];
  selectedDeviceId: string | null;
  selectedOutputDeviceId: string | null;
  recordingOffsets: Readonly<Record<string, CalibrationOffsetEntry | undefined>>;
  setRecordingOffset: (deviceId: string, offset: number) => void;
  applyCalibration: (deviceId: string, entry: { offset: number; madMs: number; outputDeviceId?: string }) => void;
  fetchAudioDevices: () => void;
}

/** The wording that depends on what the app measures with (a clap into a mic, or any sharp sound). */
export interface CalibrationMessages {
  /** Followed by the browser's own reason. */
  inputUnavailable: string;
  noSignal: string;
  rejected: string;
}

export interface LatencyCalibrationOptions {
  useStore: StoreHook<LatencyCalibrationState>;
  messages: CalibrationMessages;
  /** Play the clicks through the output the song uses, and record it with the result. */
  followOutputDevice: boolean;
}

function scheduleClick(ctx: AudioContext, atTime: number, isCountIn: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = isCountIn ? 880 : 1320;
  gain.gain.setValueAtTime(0, atTime);
  gain.gain.linearRampToValueAtTime(isCountIn ? 0.2 : 0.4, atTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.08);
  osc.start(atTime);
  osc.stop(atTime + 0.09);
}

// Some interfaces (e.g. 2-in USB devices) only route the input to one physical
// channel. The recorder works around that with a channel-fix graph, but this flow
// records its own raw stream, so pick the loudest channel here instead of assuming channel 0.
export function pickLoudestChannel(buffer: AudioBuffer): Float32Array {
  let best = buffer.getChannelData(0);
  let bestPeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    if (peak > bestPeak) {
      bestPeak = peak;
      best = data;
    }
  }
  return best;
}

function isOutOfRange(detection: ClapDetection): boolean {
  return detection.medianMs < 0 || detection.medianMs > MAX_OFFSET_MS || detection.detectedCount < MIN_DETECTED_CLAPS;
}

export function useLatencyCalibration({ useStore, messages, followOutputDevice }: LatencyCalibrationOptions) {
  const audioDevices = useStore((s) => s.audioDevices);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const outputDeviceId = useStore((s) => (followOutputDevice ? s.selectedOutputDeviceId : null));
  const recordingOffsets = useStore((s) => s.recordingOffsets);
  const setRecordingOffset = useStore((s) => s.setRecordingOffset);
  const applyCalibration = useStore((s) => s.applyCalibration);
  const fetchAudioDevices = useStore((s) => s.fetchAudioDevices);

  const [phase, setPhase] = useState<CalibrationPhase>("idle");
  const [calibTargetId, setCalibTargetId] = useState<string>("");
  const [countdown, setCountdown] = useState(0);
  const [measuredCount, setMeasuredCount] = useState(0);
  const [result, setResult] = useState<ClapDetection | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    fetchAudioDevices();
    return () => { cancelledRef.current = true; };
  }, []);

  const micDeviceId = selectedDeviceId ?? "";

  const fail = (message: string) => {
    setErrorMsg(message);
    setPhase("error");
  };

  const analyse = async (blob: Blob) => {
    try {
      const arrayBuf = await blob.arrayBuffer();
      const decCtx = new AudioContext();
      const audioBuf = await decCtx.decodeAudioData(arrayBuf);
      decCtx.close().catch((e: unknown) => console.warn("[calibration] decCtx close:", e));

      if (cancelledRef.current) return;

      const detection = detectClapLatency(pickLoudestChannel(audioBuf), audioBuf.sampleRate);
      if (detection === null) {
        fail(messages.noSignal);
      } else if (isOutOfRange(detection)) {
        console.debug("[calibration] rejected:", {
          medianMs: detection.medianMs,
          madMs: detection.madMs,
          detectedCount: detection.detectedCount,
          offsets: detection.offsets,
        });
        fail(messages.rejected);
      } else {
        setResult(detection);
        setPhase("done");
      }
    } catch (e) {
      console.error("[calibration] analysis error:", e);
      if (!cancelledRef.current) fail("Analysis failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const start = async (targetDeviceId: string) => {
    cancelledRef.current = false;
    setCalibTargetId(targetDeviceId);
    setPhase("counting");
    setCountdown(N_COUNTIN);
    setMeasuredCount(0);
    setResult(null);
    setErrorMsg("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(targetDeviceId ? { deviceId: { exact: targetDeviceId } } : {}),
          echoCancellation: { exact: false },
          noiseSuppression: { exact: false },
          autoGainControl: { exact: false },
        },
        video: false,
      });
    } catch (e) {
      console.error("[calibration] getUserMedia failed:", e);
      fail(messages.inputUnavailable + (e instanceof Error ? e.message : String(e)));
      return;
    }

    const mimeType =
      ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onerror = (e) => console.error("[calibration] MediaRecorder error:", e);

    // The same output the song plays through, so the singer hears the clicks in the headphones used for practice.
    const ctxOpts = outputDeviceId ? ({ sinkId: outputDeviceId } as AudioContextOptions) : undefined;
    const ctx = new AudioContext(ctxOpts);
    ctxRef.current = ctx;

    recorder.start(100);
    const schedBase = ctx.currentTime;
    const firstClickCtx = schedBase + FIRST_CLICK_S;

    for (let i = 0; i < N_COUNTIN + N_MEASURED; i++) {
      const clickCtx = firstClickCtx + i * INTERVAL_S;
      scheduleClick(ctx, clickCtx, i < N_COUNTIN);
      const uiDelayMs = (clickCtx - schedBase) * 1000;
      const ci = i;
      setTimeout(() => {
        if (cancelledRef.current) return;
        if (ci < N_COUNTIN) {
          setCountdown(N_COUNTIN - ci);
          setPhase("counting");
        } else {
          setMeasuredCount(ci - N_COUNTIN + 1);
          setPhase("measuring");
        }
      }, uiDelayMs);
    }

    // Stop 1.5 s after the last click to capture the last clap
    const totalDurationMs = (FIRST_CLICK_S + (N_COUNTIN + N_MEASURED - 1) * INTERVAL_S + 1.5) * 1000;

    setTimeout(async () => {
      if (cancelledRef.current) return;
      setPhase("analyzing");

      const blob = await new Promise<Blob>((resolve) => {
        const mtype = recorder.mimeType;
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mtype }));
        if (recorder.state === "recording") recorder.stop();
        else resolve(new Blob(chunksRef.current, { type: mtype }));
      });

      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch((e: unknown) => console.warn("[calibration] ctx close:", e));
      ctxRef.current = null;

      if (cancelledRef.current) return;
      await analyse(blob);
    }, totalDurationMs);
  };

  const cancel = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    ctxRef.current?.close().catch((e: unknown) =>
      console.warn("[calibration] ctx close on cancel:", e),
    );
    ctxRef.current = null;
    recorderRef.current = null;
    setPhase("idle");
  };

  const apply = () => {
    if (result !== null) {
      applyCalibration(calibTargetId, {
        offset: result.medianMs,
        madMs: result.madMs,
        ...(outputDeviceId ? { outputDeviceId } : {}),
      });
    }
    setPhase("idle");
  };

  const dismiss = () => setPhase("idle");

  const setOffsetFromInput = (deviceId: string, raw: string) =>
    setRecordingOffset(deviceId, parseInt(raw) || 0);

  const devices: AudioDeviceLike[] = [{ deviceId: "", label: "Default microphone" }, ...audioDevices];

  const targetName = (fallback: string) =>
    devices.find((d) => d.deviceId === calibTargetId)?.label?.split("(")[0].trim() ?? fallback;

  return {
    phase,
    isActive: phase !== "idle" && phase !== "done" && phase !== "error",
    countdown,
    measuredCount,
    result,
    errorMsg,
    devices,
    micDeviceId,
    recordingOffsets,
    targetName,
    start,
    cancel,
    apply,
    dismiss,
    setOffsetFromInput,
  };
}
