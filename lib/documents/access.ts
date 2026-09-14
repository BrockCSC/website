import type {
  DocumentVersionRecord,
  SigningRequestRecord,
} from "@/lib/api/types";
import { type Entity, findAll, findById } from "@/lib/db/repository";
import { documentVersionsTable, signingRequestsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
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

/**
 * The other door: an internal member signer (who may hold no exec role at
 * all — an alumni named on a request) may fetch exactly the version pinned
 * to a still-open signing request they're named on, same scoping as the
 * token door above but keyed by signup id instead of a mailed token.
 */
export const versionReadableByMemberSigner = async (
  keycloakUserId: string,
  versionId: string,
): Promise<boolean> => {
  const signup = await findSignupByUserId(keycloakUserId);
  if (!signup) return false;
  const requests = await findAll<SigningRequestRecord>(signingRequestsTable);
  return requests.some(
    (r) =>
      r.status === "sent" &&
      r.sourceVersionId === versionId &&
      r.signers.some((s) => s.kind === "member" && s.signupId === signup.id),
  );
};
