import type { Draft } from "./compose";

// Compose autosave (spec §3.3 step 8). sessionStorage, not localStorage: club
// machines are shared, and a draft should not outlive the tab. Every storage
// access is wrapped: private windows, blocked site data and quota errors all
// throw, and compose must keep working without a store.

const DEBOUNCE_MS = 500;

export const draftKey = (from: string | null) => `mail-draft:${from ?? "self"}`;

let pending: { key: string; draft: Draft } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const write = (key: string, draft: Draft) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage unavailable or full: the draft only lives in the open sheet.
  }
};

const isDraft = (value: unknown): value is Draft =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The stored draft for `key` (a pending, not yet written save counts). Sync. */
export function loadDraft(key: string): Draft | null {
  if (pending?.key === key) return pending.draft;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const normalize = (draft: Draft) =>
  JSON.stringify([
    draft.to ?? [],
    draft.cc ?? [],
    draft.subject ?? "",
    draft.html ?? "",
    draft.mode ?? "new",
    (draft.files ?? []).map((file) => file.blobId),
  ]);

/**
 * True when `seed` is the stored draft itself (page.tsx restored it), not a
 * fresh compose that merely shares a field or two with it.
 */
export function isStoredDraft(key: string, seed: Draft): boolean {
  const stored = loadDraft(key);
  return stored != null && normalize(stored) === normalize(seed);
}

/** Debounced 500ms. Compose calls it only once the user has touched the draft. */
export function saveDraft(key: string, draft: Draft): void {
  // A save for another key (the inbox changed) must not be dropped.
  if (pending && pending.key !== key) flushDraft();
  pending = { key, draft };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushDraft, DEBOUNCE_MS);
}

/** Writes any pending save now (the keep path, pagehide). */
export function flushDraft(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const next = pending;
  pending = null;
  if (next) write(next.key, next.draft);
}

/** Removes the draft, cancelling a pending save for it (so a late timer can't write it back). */
export function clearDraft(key: string): void {
  if (pending?.key === key) {
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
