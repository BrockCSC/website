import type { SignupRecord } from "@/lib/api/types";
import { findAll } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { findSharedMailbox } from "@/lib/db/shared-mailboxes";
import { isProtectedMailbox } from "./provision";
import { SYSTEM_SENDER } from "./signature";
import { addressTaken } from "./stalwart";

export const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const RESERVED = new Set([
  "admin",
  "administrator",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  "root",
  "noreply",
  "no-reply",
]);

const isReserved = (name: string): boolean =>
  RESERVED.has(name) || isProtectedMailbox(name) || name === SYSTEM_SENDER;

const usedBySignup = async (name: string): Promise<boolean> =>
  (await findAll<SignupRecord>(signupsTable)).some(
    (signup) => signup.username === name,
  );

/** A local part usable for a brand-new shared mailbox. */
export const validateNewLocalPart = async (
  raw: unknown,
): Promise<{ name: string } | { error: string }> => {
  const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!LOCAL_PART_RE.test(name)) {
    return {
      error:
        "Names are lowercase letters, digits, dots, dashes or underscores, up to 64 long.",
    };
  }
  if (isReserved(name)) {
    return { error: `"${name}" is reserved and cannot be used.` };
  }
  if (await usedBySignup(name)) {
    return { error: `"${name}" already belongs to a member's account.` };
  }
  // Outside prod nothing is ever written to Stalwart, so addressTaken below
  // can never see a mailbox created here — this table is the only record.
  if (await findSharedMailbox(name)) {
    return { error: `"${name}" is already a shared mailbox.` };
  }
  if (await addressTaken(name)) {
    return { error: `${name} is already in use on the mail server.` };
  }
  return { name };
};

/** Alias names for an existing shared mailbox: same rules, minus its own current aliases. */
export const validateAliases = async (
  raw: unknown,
  current: string[],
): Promise<{ aliases: string[] } | { error: string }> => {
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === "string")) {
    return { error: "Aliases must be a list of names." };
  }
  const names = [...new Set(raw.map((v) => v.trim().toLowerCase()))].filter(
    Boolean,
  );
  const keep = new Set(current);
  for (const name of names) {
    if (!LOCAL_PART_RE.test(name)) {
      return { error: `"${name}" is not a usable alias.` };
    }
    if (isReserved(name)) {
      return { error: `"${name}" is reserved and cannot be used.` };
    }
    if (keep.has(name)) continue;
    if (await usedBySignup(name)) {
      return { error: `"${name}" already belongs to a member's account.` };
    }
    if (await addressTaken(name)) {
      return { error: `${name} is already in use on the mail server.` };
    }
  }
  return { aliases: names };
};

/** undefined: not provided. null: provided but invalid. */
export const parseDailyLimit = (raw: unknown): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return null;
  }
  return raw;
};
