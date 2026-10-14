import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import * as api from "./ipc";

beforeEach(() => {
  invoke.mockReset();
});

describe("YouTube sign-in IPC wrappers", () => {
  it("signInYoutube calls sign_in_youtube with no arguments and returns the cookies path", async () => {
    invoke.mockResolvedValueOnce("C:\data\youtube_cookies.txt");
    await expect(api.signInYoutube()).resolves.toBe("C:\data\youtube_cookies.txt");
    expect(invoke).toHaveBeenCalledWith("sign_in_youtube");
  });

  it("signOutYoutube calls sign_out_youtube with no arguments", async () => {
    invoke.mockResolvedValueOnce(undefined);
    await api.signOutYoutube();
    expect(invoke).toHaveBeenCalledWith("sign_out_youtube");
  });

  it("propagates the backend's rejection unchanged", async () => {
    invoke.mockRejectedValueOnce("Sign-in cancelled.");
    await expect(api.signInYoutube()).rejects.toBe("Sign-in cancelled.");
  });
});
