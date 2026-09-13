import type { DocumentVersionRecord } from "@/lib/api/types";
import { type Entity, findById } from "@/lib/db/repository";
import { documentVersionsTable } from "@/lib/db/schema";
import { findValidSignerToken } from "./tokens";

/**
 * The one door external signers get: only the exact version pinned to their
 * still-valid token when its signing request was created, never any other
 * version or any other document.
 */
export const versionReadableByToken = async (
  rawToken: string,
): Promise<Entity<DocumentVersionRecord> | null> => {
  const lookup = await findValidSignerToken(rawToken);
  if (!lookup) return null;
  return findById<DocumentVersionRecord>(
    documentVersionsTable,
    lookup.request.sourceVersionId,
  );
};
