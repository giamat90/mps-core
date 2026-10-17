import { describe, it, expect } from "vitest";
import { createFriendlyError, messageIncludes } from "./friendlyError";

const plain = createFriendlyError({ uploadFallback: "Failed to process the audio file." });

describe("friendly error text", () => {
  it.each([
    ["Requested format is below the known-good floor", /out of date/],
    ["The page needs to be reloaded", /Deno/],
    ["nsig signature solving failed", /Deno/],
    ["Sign in to confirm you're not a bot", /bot detection/],
    ["bot", /bot detection/],
    ["a vpn is on", /VPN or proxy/],
    ["Private video", /private/],
    ["geo restricted", /region/],
    ["Video unavailable", /unavailable or has been removed/],
    ["It has been removed", /unavailable or has been removed/],
    ["Unsupported URL: x", /Invalid URL/],
    ["socket closed", /Network error/],
    ["[Errno 11001] getaddrinfo", /Network error/],
  ])("%s", (raw, expected) => {
    expect(plain(raw, "youtube")).toMatch(expected);
  });

  it("matches without regard to case", () => {
    expect(plain("PRIVATE VIDEO", "upload")).toMatch(/private/);
  });

  it("tells a blocked download with and without a saved session apart", () => {
    expect(plain("not a bot", "youtube", false)).toMatch(/open Settings/);
    expect(plain("not a bot", "youtube", true)).toMatch(/even with your saved YouTube session/);
  });

  it("blames the network, not the session, when a fresh sign-in is turned down", () => {
    expect(plain("Sign in to confirm you're not a bot", "youtube", true, true)).toMatch(/right after signing in/);
  });

  it("falls back to the failed action's own text", () => {
    expect(plain("something odd", "youtube")).toMatch(/signing in to YouTube/);
    expect(plain("something odd", "youtube", true)).toMatch(/even with your saved YouTube session/);
    expect(plain("something odd", "upload")).toBe("Failed to process the audio file.");
    expect(plain(undefined, "upload")).toBe("Failed to process the audio file.");
  });

  it("puts an app's own rules before the shared ones and before the fallback", () => {
    const custom = createFriendlyError({
      first: [messageIncludes(["pitch_algorithm"], ({ raw }) => String(raw))],
      last: [messageIncludes(["ffmpeg", "ffprobe"], "ffmpeg was not found.")],
      uploadFallback: "x",
    });
    expect(custom("PITCH_ALGORITHM=yin is wrong; connection", "upload")).toBe("PITCH_ALGORITHM=yin is wrong; connection");
    expect(custom("ffprobe not found", "upload")).toBe("ffmpeg was not found.");
    expect(plain("ffprobe not found", "upload")).toBe("Failed to process the audio file.");
  });
});
