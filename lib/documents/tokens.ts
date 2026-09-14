import { createHash, randomBytes } from "node:crypto";
import type { Entity } from "@/lib/db/repository";
import { findAll } from "@/lib/db/repository";
import type { Signer, SigningRequestRecord } from "@/lib/api/types";
import { signingRequestsTable } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same shape as lib/db/password-resets.ts: a link is good for this long. */
const SIGNER_TOKEN_TTL_MS = 14 * DAY_MS;

const VIEW_TOKEN_TTL_MS = 30 * DAY_MS;

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

/** An external signer's read-only link to the completed envelope, issued once it completes. */
export const issueViewToken = () => {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    viewTokenHash: hashToken(raw),
    viewTokenExpiresAt: new Date(Date.now() + VIEW_TOKEN_TTL_MS).toISOString(),
  };
};

export type SignerLookup = {
  request: Entity<SigningRequestRecord>;
  signer: Signer;
};

const isLive = (expiresAt: string | null | undefined) =>
  !!expiresAt && new Date(expiresAt).getTime() > Date.now();

/**
 * Null if the token is unknown, expired, or revoked — one generic outcome,
 * exactly like findValidResetToken, so the public routes built on this never
 * have to distinguish "wrong" from "revoked" in their response. A signer who
 * already responded still resolves; the routes refuse a second response.
 */
export const findValidSignerToken = async (
  rawToken: string,
): Promise<SignerLookup | null> => {
  const tokenHash = hashToken(rawToken);
  const requests = await findAll<SigningRequestRecord>(signingRequestsTable);
  for (const request of requests) {
    const signer = request.signers.find((s) => s.tokenHash === tokenHash);
    if (!signer) continue;
    return isLive(signer.tokenExpiresAt) ? { request, signer } : null;
  }
  return null;
};

/** Scoped to exactly one completed request; never unlocks signing or any other version. */
export const findValidViewToken = async (
  rawToken: string,
): Promise<SignerLookup | null> => {
  const viewTokenHash = hashToken(rawToken);
  const requests = await findAll<SigningRequestRecord>(signingRequestsTable);
  for (const request of requests) {
    const signer = request.signers.find(
      (s) => s.kind === "external" && s.viewTokenHash === viewTokenHash,
    );
    if (!signer) continue;
    return request.status === "completed" && isLive(signer.viewTokenExpiresAt)
      ? { request, signer }
      : null;
  }
  return null;
};
