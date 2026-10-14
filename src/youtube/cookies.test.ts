import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MANAGED_COOKIES_FILE, cookiesSource, isSessionExpiredError } from "./cookies";

describe("cookiesSource", () => {
  it("is none when nothing is configured", () => {
    expect(cookiesSource(null)).toBe("none");
    expect(cookiesSource(undefined)).toBe("none");
    expect(cookiesSource("")).toBe("none");
  });

  it("recognises the file the in-app sign-in writes, on either path style", () => {
    expect(cookiesSource(`C:\\Users\\a\\.vps\\${MANAGED_COOKIES_FILE}`)).toBe("sign-in");
    expect(cookiesSource(`/home/a/.vps/${MANAGED_COOKIES_FILE}`)).toBe("sign-in");
  });

  it("treats any other file as one the user chose", () => {
    expect(cookiesSource("C:\\Users\\a\\Downloads\\www.youtube.com_cookies.txt")).toBe("file");
    expect(cookiesSource("C:\\x\\not_youtube_cookies.txt")).toBe("file");
  });
});

describe("the managed file name", () => {
  it("is the one the Rust crate writes", () => {
    const rust = readFileSync(join(resolve(__dirname, "..", ".."), "rust", "youtube-signin", "src", "lib.rs"), "utf8");
    expect(rust.match(/pub const COOKIES_FILE: &str = "([^"]+)"/)?.[1]).toBe(MANAGED_COOKIES_FILE);
  });
});

describe("isSessionExpiredError", () => {
  it.each([
    "ERROR: [youtube] abc: Sign in to confirm you're not a bot",
    "Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies",
    "HTTP Error 403: Forbidden",
    "403 forbidden while downloading the media",
    "WARNING: [youtube] The provided YouTube account cookies are no longer valid. They have likely been rotated",
    "Bot check failed",
  ])("is true for %j", (msg) => {
    expect(isSessionExpiredError(msg)).toBe(true);
  });

  it.each([
    "Private video. Sign in if you've been granted access to this video",
    "Video unavailable",
    "This video has been removed by the uploader",
    "Could not merge both audio streams",
    "The page needs to be reloaded.",
    "Connection reset (Errno 104)",
    "",
  ])("is false for %j", (msg) => {
    expect(isSessionExpiredError(msg)).toBe(false);
  });

  it("accepts anything thrown, as invoke rejects with strings or Errors", () => {
    expect(isSessionExpiredError(new Error("Sign in to confirm you're not a bot"))).toBe(true);
    expect(isSessionExpiredError(undefined)).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});
