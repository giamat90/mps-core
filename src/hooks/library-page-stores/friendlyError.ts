import { isSessionExpiredError } from "../../youtube";

export type ErrorContext = "youtube" | "upload";

/** What a rule sees: the lower-cased message plus how the failed request was made. */
export interface ErrorProbe {
  raw: unknown;
  msg: string;
  context: ErrorContext;
  hasCookiesFile: boolean;
  freshSession: boolean;
}

/** The first rule whose `when` holds decides the text. */
export interface ErrorRule {
  when: (probe: ErrorProbe) => boolean;
  text: string | ((probe: ErrorProbe) => string);
}

/** A rule that matches when the message contains any of `fragments`. */
export function messageIncludes(fragments: readonly string[], text: ErrorRule["text"]): ErrorRule {
  return { when: ({ msg }) => fragments.some((f) => msg.includes(f)), text };
}

const YOUTUBE_FALLBACK_NO_COOKIES =
  "YouTube import failed. This is most often fixed by signing in to YouTube in Settings → YouTube. Otherwise, check that the URL is public and your internet connection is working.";
const YOUTUBE_FALLBACK_COOKIES =
  "YouTube import failed even with your saved YouTube session. It may have expired (sign in again in Settings → YouTube), or the URL/video itself may be the problem.";

const SHARED_RULES: ErrorRule[] = [
  messageIncludes(
    ["known-good floor"],
    "The YouTube downloader (yt-dlp) is out of date and YouTube has changed something it can't handle. Update it: `pip install -U -r requirements.txt` in the sidecar venv (dev), or reinstall the app (installed build).",
  ),
  messageIncludes(
    ["page needs to be reloaded", "signature solving failed"],
    "YouTube could not be read: its challenge needs the JavaScript runtime (Deno) bundled with the app, which did not run. Retry once; if it keeps failing, reinstall the app (a build without the bundled Deno is broken).",
  ),
  {
    when: ({ raw, freshSession }) => freshSession && isSessionExpiredError(raw),
    text: "YouTube turned the download down right after signing in, so your session is not the problem: this network or VPN is probably flagged. Try again without the VPN or proxy, or from another connection.",
  },
  {
    when: ({ msg }) =>
      msg.includes("sign in to confirm") || msg.includes("not a bot") || /\bbot\b/.test(msg),
    text: ({ hasCookiesFile }) =>
      hasCookiesFile
        ? "YouTube blocked the download even with your saved YouTube session (sign-in or cookies file) — it has likely expired. Sign in again in Settings → YouTube, then retry."
        : "YouTube blocked the download (bot detection). Fix: open Settings → YouTube and sign in — it's the most reliable fix for this. A VPN can also trigger this; try disabling it too.",
  },
  messageIncludes(["vpn", "proxy"], "A VPN or proxy may be blocking the connection. Disable it and retry."),
  messageIncludes(["private"], "This video is private and cannot be downloaded."),
  messageIncludes(["not available in your country", "geo"], "This video is not available in your region."),
  messageIncludes(
    ["unavailable", "has been removed", "no longer available"],
    "This video is unavailable or has been removed.",
  ),
  messageIncludes(["invalid url", "unsupported url"], "Invalid URL. Make sure you paste a valid YouTube link."),
  messageIncludes(
    ["network", "connection", "timeout", "errno", "socket"],
    "Network error. Check your internet connection (and disable VPN if active), then retry.",
  ),
];

export interface FriendlyErrorOptions {
  /** Checked before the shared rules, for messages that already say what is wrong. */
  first?: readonly ErrorRule[];
  /** Checked after the shared rules and before the generic text of the failed action. */
  last?: readonly ErrorRule[];
  /** Shown when nothing matches an upload. */
  uploadFallback: string;
}

export type FriendlyError = (
  raw: unknown,
  context: ErrorContext,
  hasCookiesFile?: boolean,
  freshSession?: boolean,
) => string;

/** The text a user sees for a failed import or upload: the first matching rule, else a generic line. */
export function createFriendlyError({ first = [], last = [], uploadFallback }: FriendlyErrorOptions): FriendlyError {
  const rules = [...first, ...SHARED_RULES, ...last];
  return (raw, context, hasCookiesFile = false, freshSession = false) => {
    const probe: ErrorProbe = { raw, msg: String(raw ?? "").toLowerCase(), context, hasCookiesFile, freshSession };
    const rule = rules.find((r) => r.when(probe));
    if (rule) return typeof rule.text === "function" ? rule.text(probe) : rule.text;
    if (context === "youtube") return hasCookiesFile ? YOUTUBE_FALLBACK_COOKIES : YOUTUBE_FALLBACK_NO_COOKIES;
    return uploadFallback;
  };
}
