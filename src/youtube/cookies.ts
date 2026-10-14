/** Name of the cookies file the in-app YouTube sign-in writes (rust/youtube-signin). */
export const MANAGED_COOKIES_FILE = "youtube_cookies.txt";

/** Where the configured cookies file came from: the in-app sign-in, or a file the user chose. */
export type CookiesSource = "none" | "sign-in" | "file";

export function cookiesSource(path: string | null | undefined): CookiesSource {
  if (!path) return "none";
  const name = path.split(/[\\/]/).pop();
  return name === MANAGED_COOKIES_FILE ? "sign-in" : "file";
}

/**
 * Did YouTube turn the request down in a way a fresh sign-in can fix? Only
 * meaningful when a cookies file was used: it is then either expired or the
 * network is flagged, and signing in again is the one thing the app can do.
 * A private or removed video says "sign in" too but is not this.
 */
export function isSessionExpiredError(raw: unknown): boolean {
  const msg = String(raw ?? "").toLowerCase();
  return (
    msg.includes("sign in to confirm") ||
    msg.includes("not a bot") ||
    /\bbot\b/.test(msg) ||
    msg.includes("403") ||
    msg.includes("forbidden") ||
    msg.includes("cookies are no longer valid")
  );
}
