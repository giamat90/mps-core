// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { createFakeStore } from "../../test/fakeStore";
import { addTakeEntries, songDirectory, useDownloadAll, type TakeFile, type ZipEntry } from "./useDownloadAll";

afterEach(() => vi.restoreAllMocks());

describe("songDirectory", () => {
  it("uses forward slashes", () => {
    expect(songDirectory({ directory: "C:\\lib\\s1" })).toBe("C:/lib/s1");
    expect(songDirectory({ directory: "/home/u/s1" })).toBe("/home/u/s1");
  });
});

describe("addTakeEntries", () => {
  const base: ZipEntry[] = [{ path: "/d/vocals.wav", archiveName: "Vocals.wav" }];

  it("names takes after the take or its position", () => {
    const out = addTakeEntries(base, [{ name: "Verse", filepath: "/t/1.wav" }, { filepath: "/t/2.wav" }]);
    expect(out.map((e) => e.archiveName)).toEqual(["Vocals.wav", "Verse.wav", "Take 2.wav"]);
    expect(out[1].path).toBe("/t/1.wav");
  });

  it("keeps archive names unique, also against the tracks", () => {
    const takes: TakeFile[] = [{ name: "Vocals", filepath: "a" }, { name: "Vocals", filepath: "b" }, { name: "Vocals", filepath: "c" }];
    expect(addTakeEntries(base, takes).map((e) => e.archiveName)).toEqual([
      "Vocals.wav", "Vocals (2).wav", "Vocals (3).wav", "Vocals (4).wav",
    ]);
  });

  it("does not change the entries it is given", () => {
    addTakeEntries(base, [{ filepath: "x" }]);
    expect(base).toHaveLength(1);
  });
});

describe("useDownloadAll", () => {
  const song = { title: "Song One", directory: "C:\\lib\\s1" };
  const setup = (takes: TakeFile[] = [{ name: "A", filepath: "/t/a.wav" }]) => {
    const store = createFakeStore({ takes });
    const exportAll = vi.fn(async () => {});
    const trackEntries = vi.fn((_s: typeof song, dir: string): ZipEntry[] => [{ path: `${dir}/vocals.wav`, archiveName: "Vocals.wav" }]);
    const hook = renderHook(() => useDownloadAll({ store, song, trackEntries, exportAll }));
    return { exportAll, trackEntries, ...hook };
  };

  it("zips the tracks and takes under the song's title", async () => {
    const { result, exportAll, trackEntries } = setup();
    await act(() => result.current.onDownload());
    expect(trackEntries).toHaveBeenCalledWith(song, "C:/lib/s1");
    expect(exportAll).toHaveBeenCalledWith(
      [
        { path: "C:/lib/s1/vocals.wav", archiveName: "Vocals.wav" },
        { path: "/t/a.wav", archiveName: "A.wav" },
      ],
      "Song One.zip",
    );
    expect(result.current.isExporting).toBe(false);
  });

  it("shows progress while the archive is written", async () => {
    let finish!: () => void;
    const { result, exportAll } = setup();
    exportAll.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.onDownload();
    });
    expect(result.current.isExporting).toBe(true);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isExporting).toBe(false);
  });

  it("logs a failure and recovers", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("zip");
    const { result, exportAll } = setup();
    exportAll.mockRejectedValue(boom);
    await act(() => result.current.onDownload());
    expect(error).toHaveBeenCalledWith("[DownloadAllButton] exportAll failed:", boom);
    expect(result.current.isExporting).toBe(false);
  });
});
