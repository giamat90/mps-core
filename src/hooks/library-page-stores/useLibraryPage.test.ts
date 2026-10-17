// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create } from "zustand";
import { act, renderHook } from "../../test/hookEnv";
import { useLibraryPage, type LibraryPageStore } from "./useLibraryPage";

interface Song { id: string; title: string; sortIndex: number; folderId?: string | null }
interface Folder { id: string; name: string; sortIndex: number }

const song = (id: string, sortIndex: number, folderId: string | null = null): Song => ({ id, title: id, sortIndex, folderId });
const folder = (id: string, sortIndex: number): Folder => ({ id, name: id, sortIndex });

function makeStore(initial: Partial<LibraryPageStore<Song, Folder>> = {}) {
  const unlisten = vi.fn();
  const actions = {
    fetchSongs: vi.fn().mockResolvedValue(undefined),
    fetchFolders: vi.fn().mockResolvedValue(undefined),
    deleteSong: vi.fn(),
    renameSong: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reorderFolders: vi.fn(),
    moveSongs: vi.fn(),
    clearError: vi.fn(),
    signInAndRetryYoutube: vi.fn(),
    initProgressListener: vi.fn().mockResolvedValue(unlisten),
  };
  const useStore = create<LibraryPageStore<Song, Folder>>(() => ({
    songs: [],
    folders: [],
    isLoading: false,
    error: null,
    sessionExpired: false,
    processing: null,
    ...actions,
    ...initial,
  }));
  return { useStore, actions, unlisten };
}

const filterSongs = (songs: Song[], _f: Folder[], q: string) => songs.filter((s) => s.id.includes(q.trim()));
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("useLibraryPage", () => {
  it("loads the library, listens for progress and reads the version once on mount", async () => {
    const { useStore, actions, unlisten } = makeStore();
    const getVersion = vi.fn().mockResolvedValue("1.2.3");
    const { result, unmount } = renderHook(() => useLibraryPage({ useStore, getVersion, filterSongs }));
    await act(async () => {});
    expect(actions.fetchSongs).toHaveBeenCalledTimes(1);
    expect(actions.fetchFolders).toHaveBeenCalledTimes(1);
    expect(actions.initProgressListener).toHaveBeenCalledTimes(1);
    expect(result.current.appVersion).toBe("1.2.3");
    unmount();
    await act(async () => {});
    expect(unlisten).toHaveBeenCalled();
  });

  it("logs a failed version lookup instead of throwing", async () => {
    const { useStore } = makeStore();
    renderHook(() => useLibraryPage({ useStore, getVersion: () => Promise.reject(new Error("no")), filterSongs }));
    await act(async () => {});
    expect(warnSpy).toHaveBeenCalledWith("[About] getVersion failed:", expect.any(Error));
  });

  it("exposes the dialogs and the import options as state", async () => {
    const { useStore } = makeStore();
    const { result } = renderHook(() => useLibraryPage({ useStore, getVersion: async () => "v", filterSongs }));
    await act(async () => {});
    act(() => result.current.openAbout());
    expect(result.current.showAbout).toBe(true);
    act(() => result.current.closeAbout());
    act(() => result.current.toggleSettings());
    expect(result.current.showSettings).toBe(true);
    act(() => result.current.setHighQuality(true));
    expect(result.current.highQuality).toBe(true);
  });

  it("reports whether the library has anything and whether an import is running", async () => {
    const empty = makeStore();
    const a = renderHook(() => useLibraryPage({ useStore: empty.useStore, getVersion: async () => "v", filterSongs }));
    expect(a.result.current.hasContent).toBe(false);
    expect(a.result.current.isProcessing).toBe(false);

    const busy = makeStore({ folders: [folder("f", 1)], processing: { stage: "x" } });
    const b = renderHook(() => useLibraryPage({ useStore: busy.useStore, getVersion: async () => "v", filterSongs }));
    expect(b.result.current.hasContent).toBe(true);
    expect(b.result.current.isProcessing).toBe(true);
    await act(async () => {});
  });

  it("searches, and clears the query", async () => {
    const { useStore } = makeStore({ songs: [song("alpha", 1), song("beta", 2)] });
    const { result } = renderHook(() => useLibraryPage({ useStore, getVersion: async () => "v", filterSongs }));
    await act(async () => {});
    act(() => result.current.setQuery("alp"));
    expect(result.current.searching).toBe(true);
    expect(result.current.matches.map((s) => s.id)).toEqual(["alpha"]);
    act(() => result.current.clearQuery());
    expect(result.current.searching).toBe(false);
  });

  it("creates a folder from a trimmed name, and does nothing for a blank or cancelled one", async () => {
    const { useStore, actions } = makeStore();
    const { result } = renderHook(() => useLibraryPage({ useStore, getVersion: async () => "v", filterSongs }));
    await act(async () => {});
    act(() => result.current.startCreatingFolder());
    expect(result.current.isCreatingFolder).toBe(true);
    act(() => result.current.setNewFolderName("  Jazz "));
    act(() => result.current.commitNewFolder());
    expect(actions.createFolder).toHaveBeenCalledWith("Jazz");
    expect(result.current.isCreatingFolder).toBe(false);
    expect(result.current.newFolderName).toBe("");

    act(() => result.current.startCreatingFolder());
    act(() => result.current.setNewFolderName("   "));
    act(() => result.current.commitNewFolder());
    act(() => result.current.startCreatingFolder());
    act(() => result.current.setNewFolderName("x"));
    act(() => result.current.cancelNewFolder());
    expect(actions.createFolder).toHaveBeenCalledTimes(1);
    expect(result.current.newFolderName).toBe("");
  });

  it("turns a drop into the store action it needs", async () => {
    const { useStore, actions } = makeStore({
      songs: [song("r1", 1), song("r2", 2)],
      folders: [folder("f1", 1), folder("f2", 2)],
    });
    const { result } = renderHook(() => useLibraryPage({ useStore, getVersion: async () => "v", filterSongs }));
    await act(async () => {});
    act(() => result.current.handleDragEnd({ active: { id: "r1" }, over: null }));
    act(() => result.current.handleDragEnd({ active: { id: "r1" }, over: { id: "r2" } }));
    expect(actions.moveSongs).toHaveBeenCalledWith(null, ["r2", "r1"]);
    act(() => result.current.handleDragEnd({ active: { id: "folder:f1" }, over: { id: "folder:f2" } }));
    expect(actions.reorderFolders).toHaveBeenCalledWith(["f2", "f1"]);
    act(() => result.current.handleDragEnd({ active: { id: "r1" }, over: { id: "r1" } }));
    expect(actions.moveSongs).toHaveBeenCalledTimes(1);
  });
});
