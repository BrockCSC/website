import { NextResponse, type NextRequest } from "next/server";
import type {
  DocumentRecord,
  SignResult,
  Signer,
  SignerSessionView,
  SigningRequestRecord,
} from "@/lib/api/types";
import { type Entity, findById } from "@/lib/db/repository";
import { documentsTable, signingRequestsTable } from "@/lib/db/schema";
import { findSignupByUserId } from "@/lib/db/signups";
import { badJson, jsonObjectWithin, notFound } from "@/lib/json";
import { clientIp } from "@/lib/rate-limit";
import {
  type EventMeta,
  SigningError,
  completedVersionIds,
  envelopeIdFor,
  isSignersTurn,
  sanitizeCertificateText,
} from "./envelope";
import { parseSignSubmission } from "./sign-submission";
import {
  declineAsSigner,
  fieldsForSigner,
  recordSignerConsent,
  recordSignerView,
  retryStuckRequest,
  signAsSigner,
} from "./signing";

type SigningRequest = Entity<SigningRequestRecord>;

/** How the signer got here: a portal session, or the link emailed to them. */
export type SignerAccess =
  { kind: "member" } | { kind: "external"; token: string };

/** Two drawn PNGs at 300KB each, base64-encoded, plus text field values. */
const MAX_SIGN_BODY_BYTES = 1024 * 1024;

/** A 500-character reason, even with every character \u-escaped. */
const MAX_DECLINE_BODY_BYTES = 16 * 1024;

export const requestMeta = (req: NextRequest): EventMeta => ({
  ip: clientIp(req),
  userAgent:
    sanitizeCertificateText(req.headers.get("user-agent") ?? "").slice(
      0,
      512,
    ) || "unknown",
});

/** Signer-facing routes are public, so an unexpected error never echoes internal detail. */
const errorResponse = (err: unknown, fallback: string) => {
  if (err instanceof SigningError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(
    `documents: ${fallback} ${err instanceof Error ? (err.stack ?? err.message) : err}`,
  );
  return NextResponse.json({ error: fallback }, { status: 500 });
};

export const findMemberSigner = async (
  requestId: string,
  keycloakUserId: string,
): Promise<{ request: SigningRequest; signer: Signer } | null> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) return null;
  const signup = await findSignupByUserId(keycloakUserId);
  const signer =
    signup &&
    request.signers.find(
      (s) => s.kind === "member" && s.signupId === signup.id,
    );
  return signer ? { request, signer } : null;
};

const completedUrls = (
  request: SigningRequestRecord,
  access: SignerAccess,
  viewToken?: string,
): SignResult["completed"] => {
  const ids = completedVersionIds(request);
  if (!ids) return undefined;
  if (access.kind === "member") {
    return {
      signedFileUrl: `/api/documents/files/${ids.signed}`,
      certificateUrl: `/api/documents/files/${ids.certificate}`,
    };
  }
  if (!viewToken) return undefined;
  const base = `/api/documents/signed/${encodeURIComponent(viewToken)}/file`;
  return {
    signedFileUrl: `${base}?which=signed`,
    certificateUrl: `${base}?which=certificate`,
  };
};

const waitingReason = (
  request: SigningRequestRecord,
  signer: Signer,
): string | undefined => {
  if (request.status === "completed") return "Everyone has signed.";
  if (request.status === "cancelled") {
    return "The sender cancelled this request.";
  }
  if (request.status === "declined") {
    return "This request was declined, so it can no longer be signed.";
  }
  if (signer.status === "signed") return "You have already signed.";
  if (signer.status === "declined") return "You declined to sign.";
  const blocking = request.signers
    .filter((s) => s.order < signer.order && s.status !== "signed")
    .sort((a, b) => a.order - b.order)[0];
  return blocking
    ? `Waiting for ${blocking.name ?? "an earlier signer"} to sign first.`
    : undefined;
};

const sessionView = async (
  request: SigningRequest,
  signer: Signer,
  access: SignerAccess,
): Promise<SignerSessionView> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  const canSign =
    request.status === "sent" &&
    (signer.status === "pending" || signer.status === "viewed") &&
    isSignersTurn(request, signer.id);
  return {
    envelopeId: envelopeIdFor(request),
    requestTitle: request.title,
    documentTitle: document?.title ?? request.title,
    requesterName: request.createdByName || "BrockCSC",
    requestStatus: request.status === "draft" ? "sent" : request.status,
    signer: {
      id: signer.id,
      name: signer.name,
      email: signer.kind === "external" ? signer.email : undefined,
      kind: signer.kind,
      status: signer.status,
      consentedAt: signer.consentedAt,
      signedAt: signer.signedAt,
    },
    fields: fieldsForSigner(request, signer.id),
    fileUrl:
      access.kind === "member"
        ? `/api/documents/files/${request.sourceVersionId}`
        : `/api/documents/sign/${encodeURIComponent(access.token)}/file`,
    canSign,
    waitingReason: canSign ? undefined : waitingReason(request, signer),
    completed: completedUrls(request, access),
  };
};

export const signerSessionResponse = async (
  req: NextRequest,
  request: SigningRequest,
  signer: Signer,
  access: SignerAccess,
) => {
  try {
    let current = await recordSignerView(
      request.id,
      signer.id,
      requestMeta(req),
    );
    if (access.kind === "member") current = await retryStuckRequest(current);
    const mine = current.signers.find((s) => s.id === signer.id);
    if (!mine) return notFound();
    return NextResponse.json(await sessionView(current, mine, access));
  } catch (err) {
    return errorResponse(err, "Could not load this signing request.");
  }
};

export const signerConsentResponse = async (
  req: NextRequest,
  request: SigningRequest,
  signer: Signer,
) => {
  try {
    return NextResponse.json(
      await recordSignerConsent(request.id, signer.id, requestMeta(req)),
    );
  } catch (err) {
    return errorResponse(err, "Could not record your consent.");
  }
};

export const signerSignResponse = async (
  req: NextRequest,
  request: SigningRequest,
  signer: Signer,
  access: SignerAccess,
) => {
  const { body, tooLarge } = await jsonObjectWithin<unknown>(
    req,
    MAX_SIGN_BODY_BYTES,
  );
  if (tooLarge) {
    return NextResponse.json(
      { error: "Your drawn signature is too large. Clear it and draw again." },
      { status: 413 },
    );
  }
  if (!body) return badJson();

  try {
    // A repeat POST after signing (a retry, or a second tab) is a chance to
    // finish a completion that failed earlier.
    if (signer.status === "signed") {
      const current = await retryStuckRequest(request);
      if (current.status === "sent" || current.status === "completed") {
        const result: SignResult = {
          signerStatus: "signed",
          requestStatus: current.status,
          completed: completedUrls(current, access),
        };
        return NextResponse.json(result);
      }
    }

    const outcome = await signAsSigner(
      request.id,
      signer.id,
      parseSignSubmission(body),
      requestMeta(req),
    );
    const result: SignResult = {
      signerStatus: "signed",
      requestStatus:
        outcome.request.status === "completed" ? "completed" : "sent",
      completed: completedUrls(
        outcome.request,
        access,
        outcome.viewTokens.get(signer.id),
      ),
    };
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "Could not record your signature.");
  }
};

export const signerDeclineResponse = async (
  req: NextRequest,
  request: SigningRequest,
  signer: Signer,
) => {
  const { body, tooLarge } = await jsonObjectWithin<{ reason?: unknown }>(
    req,
    MAX_DECLINE_BODY_BYTES,
  );
  if (tooLarge) {
    return NextResponse.json(
      { error: "That reason is too long." },
      { status: 413 },
    );
  }
  const reason =
    typeof body?.reason === "string"
      ? [...sanitizeCertificateText(body.reason)].slice(0, 500).join("").trim()
      : "";
  try {
    await declineAsSigner(
      request.id,
      signer.id,
      reason || undefined,
      requestMeta(req),
    );
    return NextResponse.json({ signerStatus: "declined" as const });
  } catch (err) {
    return errorResponse(err, "Could not record that you declined.");
  }
};
