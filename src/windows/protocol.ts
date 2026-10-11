export const EVT_STATE = "mps:state";
export const EVT_COMMAND = "mps:command";
export const EVT_HELLO = "mps:hello";
export const EVT_DOCKED = "mps:docked";

export const DETACHED_LABEL_PREFIX = "detached-";

export interface TransportSnapshot {
  /** Song time at `sentAt`. */
  time: number;
  playing: boolean;
  rate: number;
  /** Date.now() in the sending window; both windows share the machine clock. */
  sentAt: number;
}

export interface StateMessage<Shared> {
  transport: TransportSnapshot;
  shared: Shared;
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isNumberOrNull = (v: unknown): boolean => v === null || isNumber(v);
export const isStringOrNull = (v: unknown): boolean => v === null || typeof v === "string";
export const isObjectOrNull = (v: unknown): boolean => v === null || isObject(v);

const ID_MAX = 128;
/** A non-empty string of sane length: what an entity id has to be before it is acted on. */
export const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= ID_MAX;

export function isTransportSnapshot(value: unknown): value is TransportSnapshot {
  return (
    isObject(value) &&
    isNumber(value.time) &&
    typeof value.playing === "boolean" &&
    isNumber(value.rate) &&
    isNumber(value.sentAt)
  );
}

/** Everything crossing the window boundary is treated as untrusted input. */
export function isStateMessage<Shared>(
  value: unknown,
  isShared: (shared: unknown) => shared is Shared,
): value is StateMessage<Shared> {
  return isObject(value) && isTransportSnapshot(value.transport) && isShared(value.shared);
}

export interface PanelWindows<Id extends string> {
  readonly ids: readonly Id[];
  isPanel(value: unknown): value is Id;
  /** The label of the window that shows `panel`. */
  label(panel: Id): string;
  /** The window knows what it shows from its own label, never from a URL. */
  fromLabel(label: string): Id | null;
}

/**
 * The panels an app lets the user detach. Must match the allowlist the Rust side
 * keeps (a contract test in each app compares the two).
 */
export function definePanelWindows<const Id extends string>(ids: readonly Id[]): PanelWindows<Id> {
  const set: ReadonlySet<string> = new Set(ids);
  const isPanel = (value: unknown): value is Id => typeof value === "string" && set.has(value);
  return {
    ids,
    isPanel,
    label: (panel) => `${DETACHED_LABEL_PREFIX}${panel}`,
    fromLabel: (label) => {
      if (!label.startsWith(DETACHED_LABEL_PREFIX)) return null;
      const rest = label.slice(DETACHED_LABEL_PREFIX.length);
      return isPanel(rest) ? rest : null;
    },
  };
}
