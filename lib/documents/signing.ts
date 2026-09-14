import { randomUUID } from "node:crypto";
import type {
  AddSignerPayload,
  CancelSigningPayload,
  DocumentRecord,
  DocumentVersionRecord,
  RemoveSignerPayload,
  Signer,
  SignerInput,
  SigningField,
  SigningRequestRecord,
  SignupRecord,
  StartSigningPayload,
} from "@/lib/api/types";
import { type Entity, create, findById, update } from "@/lib/db/repository";
import {
  documentsTable,
  documentVersionsTable,
  signingRequestsTable,
  signupsTable,
} from "@/lib/db/schema";
import { type Actor, signingRequestsForDocument } from "./mutations";
import { buildCompletionCertificate } from "./certificate";
import {
  notifyCompletion,
  notifyDeclined,
  notifyExternalSigner,
  notifyMemberSigner,
  signerEmailAddresses,
} from "./notify";
import { storeDocumentBytes } from "./storage";
import { issueSignerToken } from "./tokens";

const displayNameForSignup = (signup: SignupRecord) =>
  [signup.firstName, signup.lastName].filter(Boolean).join(" ") ||
  signup.username ||
  "Member";

const buildSigner = async (
  input: SignerInput,
  order: number,
): Promise<Signer> => {
  if (input.kind === "member") {
    const signup = await findById<SignupRecord>(signupsTable, input.signupId);
    if (!signup) throw new Error("Unknown member signer.");
    return {
      id: randomUUID(),
      kind: "member",
      order,
      signupId: input.signupId,
      name: displayNameForSignup(signup),
      status: "pending",
    };
  }
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name || !email) {
    throw new Error("External signers need a name and an email.");
  }
  return {
    id: randomUUID(),
    kind: "external",
    order,
    name,
    email,
    status: "pending",
  };
};

/** Their turn has come, and they have not been notified of it yet. */
const isEligible = (
  signer: Signer,
  all: Signer[],
  mode: "ordered" | "parallel",
): boolean => {
  if (signer.status !== "pending" || signer.notifiedAt) return false;
  if (mode === "parallel") return true;
  return all
    .filter((s) => s.order < signer.order)
    .every((s) => s.status === "signed");
};

/** Notifies whichever signers just became eligible. Idempotent via notifiedAt. */
const notifyEligible = async (
  request: Entity<SigningRequestRecord>,
  document: DocumentRecord,
): Promise<Entity<SigningRequestRecord>> => {
  const next = request.signers.map((s) => ({ ...s }));
  let changed = false;
  for (const signer of next) {
    if (!isEligible(signer, next, request.mode)) continue;
    if (signer.kind === "external") {
      const { raw, tokenHash, tokenExpiresAt } = issueSignerToken();
      signer.tokenHash = tokenHash;
      signer.tokenExpiresAt = tokenExpiresAt;
      await notifyExternalSigner(signer, raw, document);
    } else {
      await notifyMemberSigner(signer, document, request.id);
    }
    signer.notifiedAt = new Date().toISOString();
    changed = true;
  }
  if (!changed) return request;
  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      signers: next,
    },
  );
  return updated ?? request;
};

/** Never send a signer's tokenHash to any client — it has no legitimate UI use. */
export const redactSigner = (signer: Signer): Omit<Signer, "tokenHash"> => {
  const { tokenHash: _tokenHash, ...rest } = signer;
  return rest;
};

export const redactSigningRequest = (
  request: Entity<SigningRequestRecord>,
): Omit<Entity<SigningRequestRecord>, "signers"> & {
  signers: Omit<Signer, "tokenHash">[];
} => ({ ...request, signers: request.signers.map(redactSigner) });

/** A signer's own fields only — never another signer's, whose label could name them. */
export const fieldsForSigner = (
  request: Entity<SigningRequestRecord>,
  signerId: string,
): SigningField[] =>
  request.fields?.filter((f) => f.signerId === signerId) ?? [];

/** Loose shape validation; resolveFieldValues (in recordSignerResponse) does the real per-signer filtering. */
export const parseFieldValuesInput = (
  raw: unknown,
): Record<string, string> | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      values[key] = value.trim().slice(0, 500);
    }
  }
  return values;
};

export const startSigningRequest = async (
  actor: Actor & { email?: string },
  payload: StartSigningPayload,
): Promise<Entity<SigningRequestRecord>> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    payload.documentId,
  );
  if (!document?.currentVersionId) {
    throw new Error("This document has no version to sign yet.");
  }
  // The proposer pinned a version when they reviewed it; if it's since been
  // replaced, apply nothing rather than silently sign a version nobody chose.
  if (payload.sourceVersionId !== document.currentVersionId) {
    throw new Error(
      "The document has changed since this was proposed. Start the signing request again.",
    );
  }
  const existing = await signingRequestsForDocument(document.id);
  if (existing.some((r) => r.status === "sent")) {
    throw new Error(
      "A signing request is already in progress for this document.",
    );
  }
  if (!payload.signers.length) throw new Error("Add at least one signer.");
  if (payload.signers.length > 25) throw new Error("Too many signers.");

  const signers: Signer[] = [];
  for (const [index, input] of payload.signers.entries()) {
    signers.push(await buildSigner(input, index));
  }

  // Fields are drafted against the signer's position in the array (buildSigner
  // above is what actually mints each signer's id) — resolve that here, once,
  // rather than threading ids back through the pending-approval payload.
  const fields: SigningField[] | undefined = payload.fields?.map((f) => {
    const signer = signers[f.signerIndex];
    if (!signer) throw new Error("A field references an unknown signer.");
    return {
      id: randomUUID(),
      type: f.type,
      page: f.page,
      xPercent: f.xPercent,
      yPercent: f.yPercent,
      signerId: signer.id,
      required: f.required,
      label: f.label,
    };
  });

  const created = await create<SigningRequestRecord>(signingRequestsTable, {
    documentId: document.id,
    sourceVersionId: payload.sourceVersionId,
    title: payload.title,
    mode: payload.mode,
    createdBy: actor.sub,
    createdByName: actor.name,
    createdByEmail: actor.email,
    createdAt: new Date().toISOString(),
    status: "sent",
    signers,
    fields,
  });

  return notifyEligible(created, document);
};

export const addSignerToRequest = async (
  payload: AddSignerPayload,
): Promise<Entity<SigningRequestRecord>> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    payload.signingRequestId,
  );
  if (!request) throw new Error("Signing request not found.");
  if (request.status !== "sent") {
    throw new Error("This signing request is no longer active.");
  }
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  if (!document) throw new Error("Document not found.");

  const nextOrder = request.signers.length
    ? Math.max(...request.signers.map((s) => s.order)) + 1
    : 0;
  const signer = await buildSigner(payload.signer, nextOrder);
  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      signers: [...request.signers, signer],
    },
  );
  if (!updated) throw new Error("Signing request not found.");
  return notifyEligible(updated, document);
};

/**
 * Materializes the completion certificate once every signer has signed —
 * shared by recordSignerResponse (the usual path) and removeSignerFromRequest
 * (removing the last unresponsive signer can also complete a request).
 * Returns null if `signers` isn't actually all-signed yet.
 */
const finalizeIfComplete = async (
  request: Entity<SigningRequestRecord>,
  signers: Signer[],
): Promise<Entity<SigningRequestRecord> | null> => {
  if (!signers.length || !signers.every((s) => s.status === "signed")) {
    return null;
  }
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  if (!document) throw new Error("Document not found.");
  const sourceVersion = await findById<DocumentVersionRecord>(
    documentVersionsTable,
    request.sourceVersionId,
  );
  if (!sourceVersion) throw new Error("The original version is missing.");

  const now = new Date().toISOString();
  const certificateText = buildCompletionCertificate(document, sourceVersion, {
    ...request,
    signers,
  });
  const bytes = new TextEncoder().encode(certificateText);
  const { storedFilename, sha256 } = await storeDocumentBytes(
    bytes,
    "text/plain",
  );
  const version = await create<DocumentVersionRecord>(documentVersionsTable, {
    documentId: document.id,
    storedFilename,
    originalFilename: `${request.title} - signing certificate.txt`,
    contentType: "text/plain",
    size: bytes.byteLength,
    sha256,
    uploadedBy: request.createdBy,
    uploadedByName: request.createdByName,
    uploadedAt: now,
    note: "Generated signing completion record.",
    producedBySigningRequestId: request.id,
  });
  await update<DocumentRecord>(documentsTable, document.id, {
    currentVersionId: version.id,
  });

  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      signers,
      status: "completed",
      completedAt: now,
      resultingVersionId: version.id,
      sha256,
    },
  );
  if (updated) {
    const addressGroups = await Promise.all(signers.map(signerEmailAddresses));
    const addresses = [
      request.createdByEmail ?? "",
      ...addressGroups.flat(),
    ].filter(Boolean);
    await notifyCompletion([...new Set(addresses)], document);
  }
  return updated;
};

export const removeSignerFromRequest = async (
  payload: RemoveSignerPayload,
): Promise<Entity<SigningRequestRecord>> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    payload.signingRequestId,
  );
  if (!request) throw new Error("Signing request not found.");
  if (request.status !== "sent") {
    throw new Error("This signing request is no longer active.");
  }
  const target = request.signers.find((s) => s.id === payload.signerId);
  if (!target) throw new Error("Signer not found.");
  if (target.status === "signed") {
    throw new Error("This signer has already signed and cannot be removed.");
  }

  const remaining = request.signers.filter((s) => s.id !== payload.signerId);
  if (!remaining.length) {
    throw new Error("A signing request needs at least one signer.");
  }
  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      signers: remaining,
    },
  );
  if (!updated) throw new Error("Signing request not found.");

  // Removing the last unresponsive signer can leave everyone else already
  // signed, which should complete the request exactly like a normal sign does.
  const completed = await finalizeIfComplete(updated, remaining);
  if (completed) return completed;

  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  return document ? notifyEligible(updated, document) : updated;
};

export const cancelSigningRequest = async (
  payload: CancelSigningPayload,
  actor: Actor,
): Promise<Entity<SigningRequestRecord>> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    payload.signingRequestId,
  );
  if (!request) throw new Error("Signing request not found.");
  if (request.status !== "sent") {
    throw new Error("This signing request is not active.");
  }
  const revoked = request.signers.map((s) =>
    s.status === "pending" || s.status === "viewed"
      ? { ...s, tokenHash: null, tokenExpiresAt: null }
      : s,
  );
  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: actor.sub,
      signers: revoked,
    },
  );
  if (!updated) throw new Error("Signing request not found.");
  return updated;
};

/** Approver-only (see route): resend never itself waits on co-president approval. */
export const resendSignerToken = async (
  requestId: string,
  signerId: string,
): Promise<void> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) throw new Error("Signing request not found.");
  if (request.status !== "sent") {
    throw new Error("This signing request is not active.");
  }
  const signer = request.signers.find((s) => s.id === signerId);
  if (!signer) throw new Error("Signer not found.");
  if (signer.status === "signed" || signer.status === "declined") {
    throw new Error("This signer has already responded.");
  }
  if (!signer.notifiedAt) {
    throw new Error("It is not this signer's turn yet.");
  }
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  if (!document) throw new Error("Document not found.");

  const next = request.signers.map((s) => ({ ...s }));
  const target = next.find((s) => s.id === signerId)!;
  if (target.kind === "external") {
    const { raw, tokenHash, tokenExpiresAt } = issueSignerToken();
    target.tokenHash = tokenHash;
    target.tokenExpiresAt = tokenExpiresAt;
    await notifyExternalSigner(target, raw, document);
  } else {
    await notifyMemberSigner(target, document, request.id);
  }
  await update<SigningRequestRecord>(signingRequestsTable, request.id, {
    signers: next,
  });
};

export const recordSignerView = async (
  requestId: string,
  signerId: string,
): Promise<Entity<SigningRequestRecord>> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) throw new Error("Not found.");
  const signer = request.signers.find((s) => s.id === signerId);
  if (!signer || signer.status !== "pending") return request;
  const next = request.signers.map((s) =>
    s.id === signerId
      ? { ...s, status: "viewed" as const, viewedAt: new Date().toISOString() }
      : s,
  );
  const updated = await update<SigningRequestRecord>(
    signingRequestsTable,
    request.id,
    {
      signers: next,
    },
  );
  return updated ?? request;
};

export type SignerResponse =
  | {
      action: "sign";
      signatureText: string;
      ip: string;
      userAgent: string;
      /** Raw client field id -> typed value; sanitized against this signer's own fields below. */
      fieldValues?: Record<string, string>;
    }
  | { action: "decline"; reason?: string; ip: string; userAgent: string };

/**
 * Only this signer's own fields, in case a value for someone else's field id
 * slipped into the request body — and Signature fields always resolve to the
 * signatureText already captured by the existing flow rather than a second,
 * independently-typed value.
 */
const resolveFieldValues = (
  request: Entity<SigningRequestRecord>,
  signerId: string,
  signatureText: string,
  submitted: Record<string, string> | undefined,
): Record<string, string> | undefined => {
  const mine = request.fields?.filter((f) => f.signerId === signerId);
  if (!mine?.length) return undefined;
  const values: Record<string, string> = {};
  for (const f of mine) {
    const value =
      f.type === "signature"
        ? signatureText
        : (submitted?.[f.id]?.trim() ?? "");
    if (value) values[f.id] = value;
  }
  return values;
};

/** The heart of the flow: records a response, advances ordering, and materializes the completion record once every signer is done. */
export const recordSignerResponse = async (
  requestId: string,
  signerId: string,
  response: SignerResponse,
): Promise<Entity<SigningRequestRecord>> => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) throw new Error("Not found.");
  if (request.status !== "sent") {
    throw new Error("This signing request is no longer open.");
  }
  const signer = request.signers.find((s) => s.id === signerId);
  if (!signer) throw new Error("Not found.");
  if (signer.status === "signed" || signer.status === "declined") {
    throw new Error("You have already responded to this request.");
  }
  if (
    request.mode === "ordered" &&
    request.signers.some((s) => s.order < signer.order && s.status !== "signed")
  ) {
    throw new Error("It is not your turn yet.");
  }

  if (response.action === "sign") {
    const missingRequired = request.fields?.some(
      (f) =>
        f.signerId === signerId &&
        f.required &&
        f.type !== "signature" &&
        !response.fieldValues?.[f.id]?.trim(),
    );
    if (missingRequired) {
      throw new Error("Fill in every required field before signing.");
    }
  }

  const now = new Date().toISOString();
  const updatedSigner: Signer =
    response.action === "sign"
      ? {
          ...signer,
          status: "signed",
          signedAt: now,
          signatureText: response.signatureText,
          ip: response.ip,
          userAgent: response.userAgent,
          tokenHash: null,
          tokenExpiresAt: null,
          fieldValues: resolveFieldValues(
            request,
            signerId,
            response.signatureText,
            response.fieldValues,
          ),
        }
      : {
          ...signer,
          status: "declined",
          declinedAt: now,
          declineReason: response.reason,
          ip: response.ip,
          userAgent: response.userAgent,
          tokenHash: null,
          tokenExpiresAt: null,
        };
  // A decline halts the whole request, so every other outstanding link is
  // revoked too — not just the declining signer's own.
  const nextSigners = request.signers.map((s) => {
    if (s.id === signerId) return updatedSigner;
    if (
      response.action === "decline" &&
      (s.status === "pending" || s.status === "viewed")
    ) {
      return { ...s, tokenHash: null, tokenExpiresAt: null };
    }
    return s;
  });
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );

  if (response.action === "decline") {
    const updated = await update<SigningRequestRecord>(
      signingRequestsTable,
      request.id,
      {
        signers: nextSigners,
        status: "declined",
      },
    );
    if (updated && document) {
      await notifyDeclined(
        [request.createdByEmail ?? ""].filter(Boolean),
        document,
        updatedSigner,
      );
    }
    return updated ?? request;
  }

  const allSigned = nextSigners.every((s) => s.status === "signed");
  if (!allSigned) {
    const updated = await update<SigningRequestRecord>(
      signingRequestsTable,
      request.id,
      {
        signers: nextSigners,
      },
    );
    if (!updated) return request;
    return document ? notifyEligible(updated, document) : updated;
  }

  const completed = await finalizeIfComplete(request, nextSigners);
  if (!completed) throw new Error("Could not complete this signing request.");
  return completed;
};
