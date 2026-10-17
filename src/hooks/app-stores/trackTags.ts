/**
 * Why a minimized track may be silent or alone: its waveform is shrunk to a
 * strip but its mute and solo still apply. `ids` are the tracks of the song.
 */
export function hiddenTrackTags<Id extends string>(
  visible: Readonly<Partial<Record<string, boolean>>>,
  ids: readonly Id[],
  { muted, soloed }: { muted: Readonly<Partial<Record<string, boolean>>>; soloed: string | null },
): Partial<Record<Id, string>> {
  const tags: Partial<Record<Id, string>> = {};
  for (const id of ids) {
    if (visible[id]) continue;
    if (soloed === id) tags[id] = "solo";
    else if (muted[id]) tags[id] = "muted";
  }
  return tags;
}
