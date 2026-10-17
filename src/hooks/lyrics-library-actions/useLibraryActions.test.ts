// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "../../test/hookEnv";
import { useUpdaterStore } from "../../updater";
import { useDropZone, AUDIO_EXTENSIONS } from "./useDropZone";
import { useUpdateDialog } from "./useUpdateDialog";
import { useYouTubeCookies } from "./useYouTubeCookies";
import { useYouTubeImport, YOUTUBE_URL_PATTERN } from "./useYouTubeImport";

describe("useYouTubeCookies", () => {
  const setup = (over: Partial<Parameters<typeof useYouTubeCookies>[0]> = {}) => {
    const setCookiesPath = vi.fn();
    const opts = {
      cookiesPath: null as string | null,
      setCookiesPath,
      pickFile: vi.fn(async () => "/c/cookies.txt" as string | null),
      signIn: vi.fn(async () => "/data/youtube_cookies.txt"),
      signOut: vi.fn(async () => {}),
      ...over,
    };
    return { opts, setCookiesPath, hook: renderHook(() => useYouTubeCookies(opts)) };
  };

  beforeEach(() => vi.restoreAllMocks());

  it("tells where the cookies came from", () => {
    expect(setup().hook.result.current.source).toBe("none");
    expect(setup({ cookiesPath: "/d/youtube_cookies.txt" }).hook.result.current.source).toBe("sign-in");
    expect(setup({ cookiesPath: "/d/mine.txt" }).hook.result.current.source).toBe("file");
  });

  it("signs in, holding busy while it waits, and stores the path", async () => {
    let finish: (p: string) => void = () => {};
    const signIn = vi.fn(() => new Promise<string>((r) => (finish = r)));
    const { hook, setCookiesPath } = setup({ signIn });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = hook.result.current.signIn();
    });
    expect(hook.result.current.busy).toBe(true);
    await act(async () => {
      finish("/p/youtube_cookies.txt");
      await pending;
    });
    expect(setCookiesPath).toHaveBeenCalledWith("/p/youtube_cookies.txt");
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it("reports and logs a failed sign-in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, setCookiesPath } = setup({ signIn: vi.fn(async () => Promise.reject(new Error("closed"))) });
    await act(async () => hook.result.current.signIn());
    expect(hook.result.current.error).toBe("Error: closed");
    expect(hook.result.current.busy).toBe(false);
    expect(setCookiesPath).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("signs out and forgets the path, or reports why it could not", async () => {
    const ok = setup({ cookiesPath: "/d/youtube_cookies.txt" });
    await act(async () => ok.hook.result.current.signOut());
    expect(ok.opts.signOut).toHaveBeenCalled();
    expect(ok.setCookiesPath).toHaveBeenCalledWith(null);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = setup({ signOut: vi.fn(async () => Promise.reject("locked")) });
    await act(async () => bad.hook.result.current.signOut());
    expect(bad.hook.result.current.error).toBe("locked");
    expect(bad.setCookiesPath).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("uses a chosen cookies.txt and ignores a cancelled dialog", async () => {
    const chosen = setup();
    await act(async () => chosen.hook.result.current.choose());
    expect(chosen.opts.pickFile).toHaveBeenCalledWith({ name: "Cookies", extensions: ["txt"] });
    expect(chosen.setCookiesPath).toHaveBeenCalledWith("/c/cookies.txt");

    const cancelled = setup({ pickFile: vi.fn(async () => null) });
    await act(async () => cancelled.hook.result.current.choose());
    expect(cancelled.setCookiesPath).not.toHaveBeenCalled();
  });

  it("clears the path", () => {
    const { hook, setCookiesPath } = setup({ cookiesPath: "/d/mine.txt" });
    hook.result.current.clear();
    expect(setCookiesPath).toHaveBeenCalledWith(null);
  });

  it("defaults to the shared sign-in wrappers", () => {
    expect(() => renderHook(() => useYouTubeCookies({ cookiesPath: null, setCookiesPath: vi.fn(), pickFile: vi.fn() }))).not.toThrow();
  });
});

describe("useYouTubeImport", () => {
  const url = "https://www.youtube.com/watch?v=abc";

  it("accepts YouTube links only", () => {
    expect(YOUTUBE_URL_PATTERN.test(url)).toBe(true);
    expect(YOUTUBE_URL_PATTERN.test("https://youtu.be/abc")).toBe(true);
    expect(YOUTUBE_URL_PATTERN.test("https://example.com/watch")).toBe(false);
  });

  it("refuses another link with a message and imports nothing", async () => {
    const onImport = vi.fn(async () => {});
    const { result } = renderHook(() => useYouTubeImport({ isProcessing: false, onImport }));
    act(() => result.current.setUrl("https://example.com"));
    await act(async () => result.current.submit());
    expect(result.current.error).toBe("Please enter a valid YouTube URL.");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("imports a valid link, then clears the box and the error", async () => {
    const onImport = vi.fn(async () => {});
    const { result } = renderHook(() => useYouTubeImport({ isProcessing: false, onImport }));
    act(() => result.current.setUrl("nope"));
    await act(async () => result.current.submit());
    act(() => result.current.setUrl(url));
    await act(async () => result.current.submit());
    expect(onImport).toHaveBeenCalledWith(url);
    expect(result.current.url).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("can submit only an unbusy, non-blank box", () => {
    const busy = renderHook(() => useYouTubeImport({ isProcessing: true, onImport: vi.fn() }));
    act(() => busy.result.current.setUrl(url));
    expect(busy.result.current.canSubmit).toBe(false);
    const idle = renderHook(() => useYouTubeImport({ isProcessing: false, onImport: vi.fn() }));
    expect(idle.result.current.canSubmit).toBe(false);
    act(() => idle.result.current.setUrl("  "));
    expect(idle.result.current.canSubmit).toBe(false);
    act(() => idle.result.current.setUrl(url));
    expect(idle.result.current.canSubmit).toBe(true);
  });

  it("submits on Enter unless busy", async () => {
    const onImport = vi.fn(async () => {});
    const idle = renderHook(() => useYouTubeImport({ isProcessing: false, onImport }));
    act(() => idle.result.current.setUrl(url));
    await act(async () => idle.result.current.onKeyDown({ key: "a" }));
    expect(onImport).not.toHaveBeenCalled();
    await act(async () => idle.result.current.onKeyDown({ key: "Enter" }));
    expect(onImport).toHaveBeenCalledTimes(1);

    const busy = renderHook(() => useYouTubeImport({ isProcessing: true, onImport }));
    act(() => busy.result.current.setUrl(url));
    await act(async () => busy.result.current.onKeyDown({ key: "Enter" }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe("useDropZone", () => {
  const setup = (over: Partial<Parameters<typeof useDropZone>[0]> = {}) => {
    const onUpload = vi.fn();
    const pickFile = vi.fn(async () => "C:\\music\\song.mp3" as string | null);
    const opts = { isProcessing: false, pickFile, onUpload, ...over };
    return { onUpload, pickFile, hook: renderHook(() => useDropZone(opts)) };
  };

  it("asks for audio files and keeps the pick pending, showing its file name", async () => {
    const { hook, pickFile } = setup();
    await act(async () => hook.result.current.pick());
    expect(pickFile).toHaveBeenCalledWith({ name: "Audio", extensions: AUDIO_EXTENSIONS });
    expect(hook.result.current.pendingFile).toBe("C:\\music\\song.mp3");
    expect(hook.result.current.fileName).toBe("song.mp3");
  });

  it("names a file on a POSIX path too, and has no name before a pick", async () => {
    const { hook } = setup({ pickFile: vi.fn(async () => "/home/u/a.wav") });
    expect(hook.result.current.fileName).toBeNull();
    await act(async () => hook.result.current.pick());
    expect(hook.result.current.fileName).toBe("a.wav");
  });

  it("ignores a cancelled dialog, a busy app and a pick already pending", async () => {
    const cancelled = setup({ pickFile: vi.fn(async () => null) });
    await act(async () => cancelled.hook.result.current.pick());
    expect(cancelled.hook.result.current.pendingFile).toBeNull();

    const busy = setup({ isProcessing: true });
    await act(async () => busy.hook.result.current.pick());
    expect(busy.pickFile).not.toHaveBeenCalled();

    const again = setup();
    await act(async () => again.hook.result.current.pick());
    await act(async () => again.hook.result.current.pick());
    expect(again.pickFile).toHaveBeenCalledTimes(1);
  });

  it("uploads the pending file once confirmed, then forgets it", async () => {
    const { hook, onUpload } = setup();
    act(() => hook.result.current.confirm());
    expect(onUpload).not.toHaveBeenCalled();
    await act(async () => hook.result.current.pick());
    act(() => hook.result.current.confirm());
    expect(onUpload).toHaveBeenCalledWith("C:\\music\\song.mp3");
    expect(hook.result.current.pendingFile).toBeNull();
  });

  it("cancels a pending file", async () => {
    const { hook, onUpload } = setup();
    await act(async () => hook.result.current.pick());
    act(() => hook.result.current.cancel());
    expect(hook.result.current.pendingFile).toBeNull();
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe("useUpdateDialog", () => {
  const install = vi.fn(async () => {});
  const dismiss = vi.fn();
  const put = (state: Record<string, unknown>) =>
    act(() => useUpdaterStore.setState({ installAndRestart: install, dismiss, ...state } as never));

  beforeEach(() => {
    vi.clearAllMocks();
    useUpdaterStore.setState({ status: "idle", update: null, progress: 0, dismissed: false } as never);
  });

  it("is hidden while idle or checking, or once dismissed", () => {
    const { result } = renderHook(() => useUpdateDialog());
    expect(result.current.visible).toBe(false);
    put({ status: "checking" });
    expect(result.current.visible).toBe(false);
    put({ status: "available", dismissed: true });
    expect(result.current.visible).toBe(false);
  });

  it("is visible in every other state and rounds the progress to a percent", () => {
    const { result } = renderHook(() => useUpdateDialog());
    for (const status of ["available", "downloading", "ready", "error"]) {
      put({ status, dismissed: false, progress: 0.337 });
      expect(result.current.visible).toBe(true);
      expect(result.current.status).toBe(status);
    }
    expect(result.current.percent).toBe(34);
    expect(result.current.progress).toBe(0.337);
  });

  it("exposes the update and forwards install and dismiss", () => {
    const update = { version: "1.2.3", body: "notes" };
    put({ status: "available", update });
    const { result } = renderHook(() => useUpdateDialog());
    expect(result.current.update).toBe(update);
    result.current.install();
    result.current.dismiss();
    expect(install).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
