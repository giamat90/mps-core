import { useState } from "react";
import { cookiesSource, signInYoutube, signOutYoutube, type CookiesSource } from "../../youtube";
import type { PickFile } from "./files";

export interface YouTubeCookiesOptions {
  cookiesPath: string | null;
  setCookiesPath: (path: string | null) => void;
  pickFile: PickFile;
  signIn?: () => Promise<string>;
  signOut?: () => Promise<void>;
}

export interface YouTubeCookies {
  source: CookiesSource;
  cookiesPath: string | null;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  choose: () => Promise<void>;
  clear: () => void;
}

const COOKIES_FILTER = { name: "Cookies", extensions: ["txt"] };

export function useYouTubeCookies({
  cookiesPath,
  setCookiesPath,
  pickFile,
  signIn = signInYoutube,
  signOut = signOutYoutube,
}: YouTubeCookiesOptions): YouTubeCookies {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      setCookiesPath(await signIn());
    } catch (e) {
      console.warn("[youtube] sign-in failed:", e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut();
      setCookiesPath(null);
    } catch (e) {
      console.warn("[youtube] sign-out failed:", e);
      setError(String(e));
    }
  };

  const choose = async () => {
    const selected = await pickFile(COOKIES_FILTER);
    if (selected) setCookiesPath(selected);
  };

  return {
    source: cookiesSource(cookiesPath),
    cookiesPath,
    busy,
    error,
    signIn: handleSignIn,
    signOut: handleSignOut,
    choose,
    clear: () => setCookiesPath(null),
  };
}
