import { invoke } from "@tauri-apps/api/core";

// Command names are a contract with each app's src-tauri (the thin wrappers
// around rust/youtube-signin): the apps' IPC contract test reads this file and
// checks it against their Rust handlers, so keep each wrapper a single
// `return invoke(...)`.

/** Open Google's sign-in in a private window; resolves with the saved cookies file's path once signed in */
export async function signInYoutube(): Promise<string> {
  return invoke<string>("sign_in_youtube");
}

/** Delete the cookies file written by signInYoutube (a file the user picked is never touched) */
export async function signOutYoutube(): Promise<void> {
  return invoke("sign_out_youtube");
}
