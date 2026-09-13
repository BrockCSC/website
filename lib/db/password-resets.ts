import type { PasswordResetRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { passwordResetsTable } from "./schema";

/** Null if the token is unknown, already used, or past its expiry. */
export const findValidResetToken = async (tokenHash: string) => {
  const record = (await findAll<PasswordResetRecord>(passwordResetsTable)).find(
    (row) => row.tokenHash === tokenHash,
  );
  if (!record || record.usedAt) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
  return record;
};
