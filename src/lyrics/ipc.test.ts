import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...args: unknown[]) => listen(...args) }));

import * as api from "./ipc";
import type { LyricsProgress } from "./types";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  listen.mockReset();
});

describe("lyrics IPC wrappers send the exact command name and payload the Rust side expects", () => {
  const cases: [string, () => Promise<unknown>, string, Record<string, unknown>][] = [
    ["loadLyrics", () => api.loadLyrics("s1"), "load_lyrics", { songId: "s1" }],
    ["syncLyrics", () => api.syncLyrics("s1", "la la", "lrclib"), "sync_lyrics",
      { songId: "s1", text: "la la", source: "lrclib" }],
    ["findLyrics", () => api.findLyrics("s1"), "find_lyrics", { songId: "s1" }],
    ["deleteLyrics", () => api.deleteLyrics("s1"), "delete_lyrics", { songId: "s1" }],
  ];

  it.each(cases)("%s", async (_name, call, command, payload) => {
    await call();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(command, payload);
  });

  it("leaves the source out of the payload when none is given, so Rust applies its default", async () => {
    await api.syncLyrics("s1", "la la");
    expect(invoke).toHaveBeenCalledWith("sync_lyrics", { songId: "s1", text: "la la", source: undefined });
  });

  it("returns what the backend returned", async () => {
    invoke.mockResolvedValueOnce(null);
    await expect(api.loadLyrics("s1")).resolves.toBeNull();
    invoke.mockResolvedValueOnce({ text: "a", synced: true, title: "t", artist: "", source: "lrclib" });
    await expect(api.findLyrics("s1")).resolves.toMatchObject({ title: "t" });
  });

  it("lets a backend failure through unchanged", async () => {
    invoke.mockRejectedValueOnce("No lyrics found");
    await expect(api.syncLyrics("s1", "x")).rejects.toBe("No lyrics found");
  });
});

describe("onLyricsProgress", () => {
  it("subscribes to the lyrics-progress event and unwraps the payload", async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const callback = vi.fn();

    const result = await api.onLyricsProgress(callback);

    expect(result).toBe(unlisten);
    expect(listen).toHaveBeenCalledWith("lyrics-progress", expect.any(Function));
    const progress: LyricsProgress = { songId: "s", progress: 0.7, stage: "Listening to the vocals" };
    listen.mock.calls[0][1]({ payload: progress });
    expect(callback).toHaveBeenCalledWith(progress);
  });
});
