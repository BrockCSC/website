import type {
  DocumentVersionRecord,
  SigningRequestRecord,
} from "@/lib/api/types";
import { type Entity, findAll, findById } from "@/lib/db/repository";
import { documentVersionsTable, signingRequestsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { completedVersionIds } from "./envelope";
import { findValidSignerToken, findValidViewToken } from "./tokens";

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

/** After completion, an external signer's view token opens the signed copy and the certificate, nothing else. */
export const versionReadableByViewToken = async (
  rawToken: string,
  which: "signed" | "certificate",
): Promise<Entity<DocumentVersionRecord> | null> => {
  const lookup = await findValidViewToken(rawToken);
  const ids = lookup && completedVersionIds(lookup.request);
  if (!ids) return null;
  return findById<DocumentVersionRecord>(documentVersionsTable, ids[which]);
};

/**
 * The other door: an internal member signer (who may hold no exec role at
 * all — an alumni named on a request) may fetch exactly the version pinned
 * to a still-open signing request they're named on, and once it completes,
 * its signed copy and certificate too. Keyed by signup id instead of a
 * mailed token.
 */
export const versionReadableByMemberSigner = async (
  keycloakUserId: string,
  versionId: string,
): Promise<boolean> => {
  const signup = await findSignupByUserId(keycloakUserId);
  if (!signup) return false;
  const requests = await findAll<SigningRequestRecord>(signingRequestsTable);
  return requests.some((r) => {
    if (!r.signers.some((s) => s.kind === "member" && s.signupId === signup.id))
      return false;
    if (r.status === "sent") return r.sourceVersionId === versionId;
    const ids = completedVersionIds(r);
    return (
      !!ids &&
      [r.sourceVersionId, ids.signed, ids.certificate].includes(versionId)
    );
  });
};
