import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { create } from "zustand";
import { createFriendlyError } from "./friendlyError";
import { libraryStateCreator, type LibraryApi, type LibraryCoreState } from "./libraryStore";

interface Song { id: string; title: string; folderId?: string | null }
interface Folder { id: string; name: string }
interface Processing { songId: string; stage: string; progress: number; isComplete: boolean }
interface Request { url: string; quality?: boolean }
type Upload = [quality?: boolean];
type State = LibraryCoreState<Song, Folder, Processing, Request, Upload>;

const song = (id: string, folderId: string | null = null): Song => ({ id, title: id, folderId });
const folder = (id: string): Folder => ({ id, name: id });

function setup() {
  const api = {
    listSongs: vi.fn(),
    listFolders: vi.fn(),
    processSong: vi.fn(),
    importYoutube: vi.fn(),
    deleteSong: vi.fn(),
    renameSong: vi.fn(),
    setSongIdentity: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reorderFolders: vi.fn(),
    moveSongs: vi.fn(),
    onProcessingProgress: vi.fn(),
  };
  const signInYoutube = vi.fn();
  const saveCookiesPath = vi.fn();
  const store = create<State>((set, get) =>
    libraryStateCreator<Song, Folder, Processing, Request, Upload, State>({
      api: api as unknown as LibraryApi<Song, Folder, Processing, Request, Upload>,
      friendlyError: createFriendlyError({ uploadFallback: "upload failed" }),
      signInYoutube,
      saveCookiesPath,
    })(set, get),
  );
  return { api, signInYoutube, saveCookiesPath, store, state: () => store.getState() };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe("songs", () => {
  it("fetchSongs loads and clears the loading flag, or logs and keeps what it had", async () => {
    const { api, state, store } = setup();
    api.listSongs.mockResolvedValueOnce([song("a")]);
    const pending = state().fetchSongs();
    expect(state().isLoading).toBe(true);
    await pending;
    expect(state().songs.map((s) => s.id)).toEqual(["a"]);

    api.listSongs.mockRejectedValueOnce(new Error("disk"));
    await state().fetchSongs();
    expect(errorSpy).toHaveBeenCalled();
    expect(store.getState().songs.map((s) => s.id)).toEqual(["a"]);
    expect(state().isLoading).toBe(false);
  });

  it("uploadSong shows a preparing status, passes the extra arguments on and appends the song", async () => {
    const { api, state } = setup();
    let resolve!: (s: Song) => void;
    api.processSong.mockReturnValue(new Promise<Song>((r) => (resolve = r)));
    const pending = state().uploadSong("/x.mp3", true);
    expect(state().processing).toEqual({ songId: "", stage: "Preparing…", progress: 0, isComplete: false });
    resolve(song("new"));
    await pending;
    expect(api.processSong).toHaveBeenCalledWith("/x.mp3", true);
    expect(state().songs.map((s) => s.id)).toEqual(["new"]);
    expect(state().processing).toBeNull();
  });

  it("uploadSong turns a failure into the friendly text", async () => {
    const { api, state } = setup();
    api.processSong.mockRejectedValue("boom");
    await state().uploadSong("/x.mp3");
    expect(state().error).toBe("upload failed");
    expect(state().processing).toBeNull();
  });

  it("deleteSong, renameSong and setSongIdentity update the list; failures are logged", async () => {
    const { api, state } = setup();
    api.listSongs.mockResolvedValue([song("a"), song("b")]);
    await state().fetchSongs();

    api.deleteSong.mockResolvedValueOnce(undefined);
    await state().deleteSong("a");
    expect(state().songs.map((s) => s.id)).toEqual(["b"]);
    api.deleteSong.mockRejectedValueOnce(new Error("x"));
    await state().deleteSong("b");
    expect(state().songs).toHaveLength(1);

    api.renameSong.mockResolvedValueOnce({ id: "b", title: "New" });
    await state().renameSong("b", "New");
    expect(state().songs[0].title).toBe("New");
    api.renameSong.mockRejectedValueOnce("nope");
    await state().renameSong("b", "Other");
    expect(state().error).toBe("nope");

    api.setSongIdentity.mockResolvedValueOnce({ id: "b", title: "Id" });
    expect(await state().setSongIdentity("b", " T ", "  ")).toEqual({ id: "b", title: "Id" });
    expect(api.setSongIdentity).toHaveBeenCalledWith("b", "T", null);
    api.setSongIdentity.mockRejectedValueOnce("refused");
    expect(await state().setSongIdentity("b", "T", "A")).toBeNull();
    expect(state().error).toBe("refused");
  });
});

describe("folders", () => {
  it("fetch, create, rename, reorder and delete", async () => {
    const { api, state } = setup();
    api.listFolders.mockResolvedValueOnce([folder("f1")]);
    await state().fetchFolders();
    api.createFolder.mockResolvedValueOnce(folder("f2"));
    await state().createFolder("f2");
    api.renameFolder.mockResolvedValueOnce({ id: "f2", name: "Two" });
    await state().renameFolder("f2", "Two");
    expect(state().folders.map((f) => f.name)).toEqual(["f1", "Two"]);
    api.reorderFolders.mockResolvedValueOnce([folder("f2"), folder("f1")]);
    await state().reorderFolders(["f2", "f1"]);
    expect(state().folders.map((f) => f.id)).toEqual(["f2", "f1"]);

    api.listSongs.mockResolvedValue([song("a", "f1"), song("b")]);
    await state().fetchSongs();
    api.deleteFolder.mockResolvedValueOnce(undefined);
    await state().deleteFolder("f1");
    expect(state().folders.map((f) => f.id)).toEqual(["f2"]);
    expect(state().songs.map((s) => s.folderId)).toEqual([null, null]);
  });

  it("logs failures; the ones with a user-facing effect also set the error", async () => {
    const { api, state } = setup();
    api.listFolders.mockRejectedValueOnce(new Error("a"));
    await state().fetchFolders();
    api.createFolder.mockRejectedValueOnce("c");
    await state().createFolder("x");
    expect(state().error).toBe("c");
    api.renameFolder.mockRejectedValueOnce("r");
    await state().renameFolder("f", "n");
    expect(state().error).toBe("r");
    state().clearError();
    api.deleteFolder.mockRejectedValueOnce(new Error("d"));
    await state().deleteFolder("f");
    api.reorderFolders.mockRejectedValueOnce(new Error("o"));
    await state().reorderFolders([]);
    expect(state().error).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(5);
  });

  it("moveSongs replaces the moved songs with the backend's copies", async () => {
    const { api, state } = setup();
    api.listSongs.mockResolvedValue([song("a"), song("b")]);
    await state().fetchSongs();
    api.moveSongs.mockResolvedValueOnce([song("b", "f1")]);
    await state().moveSongs("f1", ["b"]);
    expect(state().songs.map((s) => s.folderId)).toEqual([null, "f1"]);
    api.moveSongs.mockRejectedValueOnce("full");
    await state().moveSongs(null, ["b"]);
    expect(state().error).toBe("full");
  });
});

describe("YouTube import", () => {
  it("appends the song, clearing the connecting status", async () => {
    const { api, state } = setup();
    let resolve!: (s: Song) => void;
    api.importYoutube.mockReturnValue(new Promise<Song>((r) => (resolve = r)));
    const pending = state().importYoutubeRequest({ url: "u" }, "/c.txt");
    expect(state().processing?.stage).toBe("Connecting…");
    resolve(song("yt"));
    await pending;
    expect(api.importYoutube).toHaveBeenCalledWith({ url: "u" }, "/c.txt");
    expect(state().songs.map((s) => s.id)).toEqual(["yt"]);
  });

  it("offers a sign-in retry only when a saved session was turned down", async () => {
    const { api, state } = setup();
    api.importYoutube.mockRejectedValue("Sign in to confirm you're not a bot");

    await state().importYoutubeRequest({ url: "u" }, null);
    expect(state().sessionExpired).toBe(false);
    expect(state().retryableYoutubeImport).toBeNull();

    await state().importYoutubeRequest({ url: "u" }, "/c.txt");
    expect(state().sessionExpired).toBe(true);
    expect(state().retryableYoutubeImport).toEqual({ url: "u" });

    await state().importYoutubeRequest({ url: "u" }, "/c.txt", { freshSession: true });
    expect(state().sessionExpired).toBe(false);
    expect(state().error).toMatch(/right after signing in/);
  });

  it("signs in again and retries the same request on a fresh session", async () => {
    const { api, signInYoutube, saveCookiesPath, state } = setup();
    api.importYoutube.mockRejectedValueOnce("Sign in to confirm you're not a bot");
    await state().importYoutubeRequest({ url: "u", quality: true }, "/old.txt");

    signInYoutube.mockResolvedValueOnce("/new.txt");
    api.importYoutube.mockResolvedValueOnce(song("yt"));
    await state().signInAndRetryYoutube();
    expect(saveCookiesPath).toHaveBeenCalledWith("/new.txt");
    expect(api.importYoutube).toHaveBeenLastCalledWith({ url: "u", quality: true }, "/new.txt");
    expect(state().songs.map((s) => s.id)).toEqual(["yt"]);
    expect(state().retryableYoutubeImport).toBeNull();
  });

  it("keeps the retry on offer when the sign-in itself fails, and does nothing without a request", async () => {
    const { api, signInYoutube, state } = setup();
    await state().signInAndRetryYoutube();
    expect(signInYoutube).not.toHaveBeenCalled();

    api.importYoutube.mockRejectedValueOnce("Sign in to confirm you're not a bot");
    await state().importYoutubeRequest({ url: "u" }, "/old.txt");
    signInYoutube.mockRejectedValueOnce("window closed");
    await state().signInAndRetryYoutube();
    expect(state().error).toBe("window closed");
    expect(state().sessionExpired).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clearError drops the error and the retry", async () => {
    const { api, state } = setup();
    api.importYoutube.mockRejectedValueOnce("Sign in to confirm you're not a bot");
    await state().importYoutubeRequest({ url: "u" }, "/old.txt");
    state().clearError();
    expect(state().error).toBeNull();
    expect(state().sessionExpired).toBe(false);
    expect(state().retryableYoutubeImport).toBeNull();
  });
});

describe("progress listener", () => {
  it("shows the status until it completes and hands back the unlisten function", async () => {
    const { api, state } = setup();
    let emit!: (s: Processing) => void;
    const unlisten = vi.fn();
    api.onProcessingProgress.mockImplementation(async (cb: (s: Processing) => void) => {
      emit = cb;
      return unlisten;
    });
    expect(await state().initProgressListener()).toBe(unlisten);
    const status = { songId: "a", stage: "x", progress: 0.5, isComplete: false };
    emit(status);
    expect(state().processing).toEqual(status);
    emit({ ...status, isComplete: true });
    expect(state().processing).toBeNull();
  });
});
