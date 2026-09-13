import { createHash, randomBytes } from "node:crypto";
import type { Entity } from "@/lib/db/repository";
import { findAll } from "@/lib/db/repository";
import type { Signer, SigningRequestRecord } from "@/lib/api/types";
import { signingRequestsTable } from "@/lib/db/schema";

/** Same shape as lib/db/password-resets.ts: a link is good for this long. */
const SIGNER_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const hashToken = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");

export const issueSignerToken = () => {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    tokenHash: hashToken(raw),
    tokenExpiresAt: new Date(Date.now() + SIGNER_TOKEN_TTL_MS).toISOString(),
  };
};

export type SignerLookup = {
  request: Entity<SigningRequestRecord>;
  signer: Signer;
};

/**
 * Null if the token is unknown, expired, or already spent — one generic
 * outcome, exactly like findValidResetToken, so the public routes built on
 * this never have to distinguish "wrong" from "used up" in their response.
 */
export const findValidSignerToken = async (
  rawToken: string,
): Promise<SignerLookup | null> => {
  const tokenHash = hashToken(rawToken);
  const requests = await findAll<SigningRequestRecord>(signingRequestsTable);
  for (const request of requests) {
    const signer = request.signers.find((s) => s.tokenHash === tokenHash);
    if (!signer) continue;
    if (!signer.tokenExpiresAt) return null;
    if (new Date(signer.tokenExpiresAt).getTime() <= Date.now()) return null;
    return { request, signer };
  }
  return null;
};
