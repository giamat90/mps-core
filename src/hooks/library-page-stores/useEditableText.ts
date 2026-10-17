import { useState } from "react";

/** A label that turns into a text field: double-click or the pencil starts it, Enter or blur commits, Escape cancels. */
export function useEditableText(value: string, onCommit: (next: string) => void) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  const start = (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setText(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
  };

  const cancel = () => setEditing(false);

  const onKeyDown = (e: { key: string }) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") cancel();
  };

  return { editing, text, setText, start, commit, cancel, onKeyDown };
}
