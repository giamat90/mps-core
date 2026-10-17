/** A file type the user may pick; the app turns it into its own dialog's filter. */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Opens the app's native file dialog; resolves null when the user cancels. */
export type PickFile = (filter: FileFilter) => Promise<string | null>;
