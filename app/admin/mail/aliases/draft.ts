import type { Recipients } from "./api";

// The alias editor's unsaved form, mirrored to sessionStorage (spec §3.4.1,
// D22). Back (edge swipe, browser or Android back) closes the editor without
// asking, so the edits live here until they are saved, discarded or restored.
// Every access is wrapped: private windows and blocked storage throw.

export type AliasDraft = {
  name: string;
  description: string;
  extras: string[];
  recipients: Recipients;
};

/** `alias-draft:<name>` for an existing alias, `alias-draft:new` for a new one. */
export const aliasDraftKey = (name: string | null) =>
  `alias-draft:${name ?? "new"}`;

const isDraft = (value: unknown): value is AliasDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<AliasDraft>;
  return (
    typeof draft.name === "string" &&
    typeof draft.description === "string" &&
    Array.isArray(draft.extras) &&
    typeof draft.recipients === "object" &&
    draft.recipients !== null
  );
};

export function loadAliasDraft(key: string): AliasDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) return null;
    const r = parsed.recipients;
    return {
      ...parsed,
      recipients: {
        people: r.people ?? [],
        groups: r.groups ?? [],
        external: r.external ?? [],
        roles: r.roles ?? [],
      },
    };
  } catch {
    return null;
  }
}

export function saveAliasDraft(key: string, draft: AliasDraft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage unavailable or full: the edits only live in the open editor.
  }
}

export function clearAliasDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

/** Same members, in any order (toggling a role off and on is no change). */
const same = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((item, index) => item === right[index]);
};

export const sameRecipients = (a: Recipients, b: Recipients) =>
  same(a.people, b.people) &&
  same(a.groups, b.groups) &&
  same(a.external, b.external) &&
  same(a.roles, b.roles);

export const sameDraft = (a: AliasDraft, b: AliasDraft) =>
  a.name === b.name &&
  a.description === b.description &&
  same(a.extras, b.extras) &&
  sameRecipients(a.recipients, b.recipients);
