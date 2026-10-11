// The public surface, pinned. Both apps compile against these names, so a
// removed or renamed export is a breaking change: this test fails until the
// list below is edited on purpose (and the package version bumped to match).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(__dirname, "..");
const exportsMap = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { exports: Record<string, string> }).exports;

const SURFACE: Record<string, string[]> = {
  "./metronome": ["metronome"],
  "./recorder": ["VocalRecorder"],
  "./metronomeSync": ["computeMetronomePhase", "countInDurationSeconds"],
  "./zoomPan": [
    "FOLLOW_MARGIN_RATIO",
    "FOLLOW_RESUME_SUPPRESS_MS",
    "MAX_PX_PER_SEC",
    "PAN_SENSITIVITY_MULT",
    "ZOOM_SENSITIVITY",
    "clamp",
    "computePan",
    "computeZoomToCursor",
    "wheelDeltaPixels",
  ],
  "./music": ["A4_FREQUENCY", "A4_MIDI", "NOTE_NAMES", "frequencyToMidi", "frequencyToNote", "midiToFrequency"],
  "./updater": ["useUpdaterStore"],
  "./panels": ["createPanelStore"],
  "./takes": ["EMPTY_SELECTION", "hideTake", "reconcileTakes", "showTake", "toggleTake"],
  "./windows": [
    "DETACHED_LABEL_PREFIX",
    "EVT_COMMAND",
    "EVT_DOCKED",
    "EVT_HELLO",
    "EVT_STATE",
    "RemoteClock",
    "TransportPublisher",
    "createDetachedBridge",
    "createDetachedStore",
    "createDockGesture",
    "decideDrop",
    "definePanelWindows",
    "isId",
    "isNumber",
    "isNumberOrNull",
    "isObject",
    "isObjectOrNull",
    "isStateMessage",
    "isStringOrNull",
    "isTransportSnapshot",
    "panelsToClose",
    "startMainBridge",
  ],
  "./lyrics": [
    "LINE_HOLD_S",
    "LINE_LEAD_IN_S",
    "activeLineIndex",
    "activeWordIndex",
    "deleteLyrics",
    "findLyrics",
    "lineSeekTime",
    "loadLyrics",
    "lyricsPlainText",
    "onLyricsProgress",
    "syncLyrics",
    "useLyricsStore",
  ],
};

describe("public API surface", () => {
  it("lists exactly the entries package.json exports", () => {
    expect(Object.keys(exportsMap).sort()).toEqual(Object.keys(SURFACE).sort());
  });

  it.each(Object.entries(SURFACE))("%s exports exactly the pinned names", async (subpath, names) => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(resolve(root, exportsMap[subpath])).href);
    expect(Object.keys(mod).sort()).toEqual([...names].sort());
  });
});
