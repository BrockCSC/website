import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  SigningEvent,
  SigningEventType,
  SigningRequestRecord,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import { type Entity, findById, toEntity } from "@/lib/db/repository";
import { signingRequestsTable } from "@/lib/db/schema";

type SigningRequest = Entity<SigningRequestRecord>;

/** Carries the HTTP status a route should answer with. */
export class SigningError extends Error {
  status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Signer- and preparer-supplied strings end up on the certificate, one per
 * line. Strip control and line/paragraph-separator characters so a value can
 * never inject a fake extra line, such as a forged signer entry.
 */
export const sanitizeCertificateText = (value: string): string =>
  value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim();

export type EventMeta = { ip?: string; userAgent?: string; actorName?: string };

export const signingEvent = (
  type: SigningEventType,
  meta: EventMeta & { signerId?: string } = {},
  at = new Date().toISOString(),
): SigningEvent => ({
  type,
  at,
  signerId: meta.signerId,
  actorName: meta.actorName,
  ip: meta.ip,
  userAgent: meta.userAgent,
});

export const newEnvelopeId = () => randomUUID().toUpperCase();

/** Rows from before envelope ids existed show their own uppercased request id. */
export const envelopeIdFor = (request: SigningRequest): string =>
  request.envelopeId ?? request.id.toUpperCase();

export const isSignersTurn = (
  request: SigningRequestRecord,
  signerId: string,
): boolean => {
  const signer = request.signers.find((s) => s.id === signerId);
  if (!signer) return false;
  if (request.mode === "parallel") return true;
  return request.signers.every(
    (s) => s.order >= signer.order || s.status === "signed",
  );
};

/**
 * Which versions a finished request offers as "signed" and "certificate".
 * Old rows never stamped the PDF: their certificate was the .txt record, so
 * the source version stands in for the signed file.
 */
export const completedVersionIds = (
  request: SigningRequestRecord,
): { signed: string; certificate: string } | null => {
  if (request.status !== "completed" || !request.resultingVersionId) {
    return null;
  }
  return request.certificateVersionId
    ? {
        signed: request.resultingVersionId,
        certificate: request.certificateVersionId,
      }
    : {
        signed: request.sourceVersionId,
        certificate: request.resultingVersionId,
      };
};

/**
 * Compare-and-swap on signers, status and the completion follow-up flag: two
 * responses racing on one request can never overwrite each other's signer
 * entry, and two follow-ups can't both clear the flag and email everyone.
 * Events are appended in SQL, never rewritten from a stale copy. Null means
 * someone else changed the request first; re-read and try again.
 */
export const commitRequest = async (
  current: SigningRequest,
  patch: Partial<SigningRequestRecord>,
  events: SigningEvent[] = [],
): Promise<SigningRequest | null> => {
  const table = signingRequestsTable;
  const { events: _events, ...safePatch } = patch;
  const merged = sql`${table.data} || ${JSON.stringify(safePatch)}::jsonb`;
  const data = events.length
    ? sql`jsonb_set(${merged}, '{events}', coalesce(${table.data}->'events', '[]'::jsonb) || ${JSON.stringify(events)}::jsonb)`
    : merged;
  const rows = await db
    .update(table)
    .set({ data })
    .where(
      and(
        eq(table.id, current.id),
        sql`${table.data}->'signers' = ${JSON.stringify(current.signers)}::jsonb`,
        sql`${table.data}->>'status' = ${current.status}`,
        sql`coalesce(${table.data}->>'completionFollowUpPending', 'false') = ${current.completionFollowUpPending ? "true" : "false"}`,
      ),
    )
    .returning();
  return rows[0] ? toEntity<SigningRequestRecord>(rows[0]) : null;
};

export const loadSigningRequest = async (
  requestId: string,
): Promise<SigningRequest> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) throw new SigningError(404, "Signing request not found.");
  return request;
};

/** Re-reads and re-runs `attempt` until its commit wins; `attempt` returns null when it lost. */
export const withFreshRequest = async <T>(
  requestId: string,
  attempt: (request: SigningRequest) => Promise<T | null>,
): Promise<T> => {
  for (let tries = 0; tries < 5; tries++) {
    const result = await attempt(await loadSigningRequest(requestId));
    if (result !== null) return result;
  }
  throw new SigningError(
    409,
    "This signing request changed while saving. Try again.",
  );
};
