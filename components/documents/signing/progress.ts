// Signing progress kept in sessionStorage under `sign:<token>`, so a reload or
// a stray tap away and back doesn't throw away an adopted signature, stamped
// fields or typed text. Every access is guarded: storage can be missing,
// full or blocked, and the page must work without it.

import type { AdoptedDraft } from "./adopted";
import type { Stroke } from "./signature-pad";

export type SavedProgress = {
  adopted: AdoptedDraft | null;
  stamped: string[];
  textValues: Record<string, string>;
};

/** Drawn-but-not-yet-adopted pads, per mark. */
export type SavedPads = Partial<
  Record<"signature" | "initials", { strokes: Stroke[]; png: string | null }>
>;

const read = <T>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: progress just isn't kept.
  }
};

const padsKey = (key: string) => `${key}:pads`;

export const readProgress = (key: string) => read<SavedProgress>(key);
export const writeProgress = (key: string, value: SavedProgress) =>
  write(key, value);

export const readPads = (key: string) => read<SavedPads>(padsKey(key));
export const writePads = (key: string, value: SavedPads) =>
  write(padsKey(key), value);

/** After finishing or declining. */
export const clearProgress = (key: string) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
    window.sessionStorage.removeItem(padsKey(key));
  } catch {
    // Nothing to do.
  }
};
