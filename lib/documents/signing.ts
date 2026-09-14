import { randomUUID } from "node:crypto";
import type {
  AddSignerPayload,
  AdoptedSignature,
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
import { type Entity, create, findById } from "@/lib/db/repository";
import {
  documentsTable,
  documentVersionsTable,
  signingRequestsTable,
  signupsTable,
} from "@/lib/db/schema";
import {
  type EventMeta,
  SigningError,
  commitRequest,
  envelopeIdFor,
  isSignersTurn,
  loadSigningRequest,
  newEnvelopeId,
  signingEvent,
  withFreshRequest,
} from "./envelope";
import { type FinalizeOutcome, finalizeIfComplete } from "./finalize";
import { type Actor, signingRequestsForDocument } from "./mutations";
import {
  notifyDeclined,
  notifyExternalSigner,
  notifyMemberSigner,
} from "./notify";
import { type ParsedSubmission, resolveFieldValues } from "./sign-submission";
import { deleteDocumentFile, storeDocumentBytes } from "./storage";
import { issueSignerToken } from "./tokens";

type SigningRequest = Entity<SigningRequestRecord>;

/** The proposer's IP rides in the payload, so a request queued for approval still records its originator. */
export type StartSigningInput = StartSigningPayload & { createdByIp?: string };

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
    if (!signup) throw new SigningError(400, "Unknown member signer.");
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
    throw new SigningError(400, "External signers need a name and an email.");
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

/**
 * Notifies whichever signers just became eligible, once each (notifiedAt).
 * Mail goes out only after the commit wins, so a lost race never double-sends.
 */
const notifyEligible = async (
  request: SigningRequest,
): Promise<SigningRequest> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  if (!document) return request;
  let current = request;
  for (let tries = 0; tries < 5; tries++) {
    if (current.status !== "sent") return current;
    const now = new Date().toISOString();
    const outgoing: { signer: Signer; rawToken?: string }[] = [];
    const signers = current.signers.map((s) => {
      if (!isEligible(s, current.signers, current.mode)) return s;
      const next: Signer = { ...s, notifiedAt: now };
      let rawToken: string | undefined;
      if (s.kind === "external") {
        const token = issueSignerToken();
        next.tokenHash = token.tokenHash;
        next.tokenExpiresAt = token.tokenExpiresAt;
        rawToken = token.raw;
      }
      outgoing.push({ signer: next, rawToken });
      return next;
    });
    if (!outgoing.length) return current;

    const updated = await commitRequest(
      current,
      { signers },
      outgoing.map(({ signer }) =>
        signingEvent("sent", { signerId: signer.id }, now),
      ),
    );
    if (updated) {
      for (const { signer, rawToken } of outgoing) {
        if (rawToken) {
          await notifyExternalSigner(signer, rawToken, document, updated);
        } else {
          await notifyMemberSigner(signer, document, updated);
        }
      }
      return updated;
    }
    current = await loadSigningRequest(request.id);
  }
  return current;
};

type SafeSigner = Omit<Signer, "tokenHash" | "viewTokenHash">;

/** Never send a signer's token hashes to any client — they have no legitimate UI use. */
const redactSigner = (signer: Signer): SafeSigner => {
  const {
    tokenHash: _tokenHash,
    viewTokenHash: _viewTokenHash,
    ...rest
  } = signer;
  return rest;
};

/** Also fills envelopeId for rows from before it was stored, so every client sees one. */
export const redactSigningRequest = (
  request: SigningRequest,
): Omit<SigningRequest, "signers"> & { signers: SafeSigner[] } => ({
  ...request,
  envelopeId: envelopeIdFor(request),
  signers: request.signers.map(redactSigner),
});

/** A signer's own fields only — never another signer's, whose label could name them. */
export const fieldsForSigner = (
  request: SigningRequestRecord,
  signerId: string,
): SigningField[] =>
  request.fields?.filter((f) => f.signerId === signerId) ?? [];

/**
 * Checked by the start route before a proposal is queued, and again when it
 * applies: only PDFs can be stamped, and every signer needs somewhere to sign.
 */
export const assertSignable = async (
  payload: StartSigningPayload,
): Promise<void> => {
  const version = await findById<DocumentVersionRecord>(
    documentVersionsTable,
    payload.sourceVersionId,
  );
  if (!version) {
    throw new SigningError(400, "This document has no version to sign yet.");
  }
  if (version.contentType !== "application/pdf") {
    throw new SigningError(
      400,
      "Only PDFs can be sent for signing. Upload the document as a PDF first.",
    );
  }
  if (!payload.signers.length) {
    throw new SigningError(400, "Add at least one signer.");
  }
  if (payload.signers.length > 25) {
    throw new SigningError(400, "Too many signers.");
  }
  const fields = payload.fields ?? [];
  if (fields.some((f) => !payload.signers[f.signerIndex])) {
    throw new SigningError(400, "A field references an unknown signer.");
  }
  const missing = payload.signers.findIndex(
    (_, index) =>
      !fields.some((f) => f.signerIndex === index && f.type === "signature"),
  );
  if (missing !== -1) {
    const input = payload.signers[missing];
    const who =
      input.kind === "external" ? input.name : `signer ${missing + 1}`;
    throw new SigningError(
      400,
      `Place at least one Signature field for ${who}.`,
    );
  }
};

export const startSigningRequest = async (
  actor: Actor & { email?: string },
  payload: StartSigningInput,
  meta: EventMeta = {},
): Promise<SigningRequest> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    payload.documentId,
  );
  if (!document?.currentVersionId) {
    throw new SigningError(400, "This document has no version to sign yet.");
  }
  // The proposer pinned a version when they reviewed it; if it's since been
  // replaced, apply nothing rather than silently sign a version nobody chose.
  if (payload.sourceVersionId !== document.currentVersionId) {
    throw new SigningError(
      409,
      "The document has changed since this was proposed. Start the signing request again.",
    );
  }
  const existing = await signingRequestsForDocument(document.id);
  if (existing.some((r) => r.status === "sent")) {
    throw new SigningError(
      409,
      "A signing request is already in progress for this document.",
    );
  }
  await assertSignable(payload);

  const signers: Signer[] = [];
  for (const [index, input] of payload.signers.entries()) {
    signers.push(await buildSigner(input, index));
  }

  // Fields are drafted against the signer's position in the array (buildSigner
  // above is what actually mints each signer's id) — resolve that here, once,
  // rather than threading ids back through the pending-approval payload.
  const fields: SigningField[] = (payload.fields ?? []).map((f) => ({
    id: randomUUID(),
    type: f.type,
    page: f.page,
    xPercent: f.xPercent,
    yPercent: f.yPercent,
    signerId: signers[f.signerIndex].id,
    required: f.required,
    label: f.label,
  }));

  const createdAt = new Date().toISOString();
  const createdByIp = payload.createdByIp ?? meta.ip;
  const created = await create<SigningRequestRecord>(signingRequestsTable, {
    documentId: document.id,
    sourceVersionId: payload.sourceVersionId,
    title: payload.title,
    mode: payload.mode,
    createdBy: actor.sub,
    createdByName: actor.name,
    createdByEmail: actor.email,
    createdByIp,
    createdAt,
    status: "sent",
    signers,
    fields,
    envelopeId: newEnvelopeId(),
    events: [
      signingEvent(
        "created",
        { actorName: actor.name, ip: createdByIp, userAgent: meta.userAgent },
        createdAt,
      ),
    ],
  });

  return notifyEligible(created);
};

/** A signer added mid-flight has no placed fields; their signature is recorded on the certificate. */
export const addSignerToRequest = (
  payload: AddSignerPayload,
  meta: EventMeta = {},
): Promise<SigningRequest> =>
  withFreshRequest(payload.signingRequestId, async (request) => {
    if (request.status !== "sent") {
      throw new SigningError(409, "This signing request is no longer active.");
    }
    const nextOrder = request.signers.length
      ? Math.max(...request.signers.map((s) => s.order)) + 1
      : 0;
    const signer = await buildSigner(payload.signer, nextOrder);
    const updated = await commitRequest(
      request,
      { signers: [...request.signers, signer] },
      [signingEvent("signer-added", { ...meta, signerId: signer.id })],
    );
    return updated ? notifyEligible(updated) : null;
  });

export const removeSignerFromRequest = (
  payload: RemoveSignerPayload,
  meta: EventMeta = {},
): Promise<SigningRequest> =>
  withFreshRequest(payload.signingRequestId, async (request) => {
    if (request.status !== "sent") {
      throw new SigningError(409, "This signing request is no longer active.");
    }
    const target = request.signers.find((s) => s.id === payload.signerId);
    if (!target) throw new SigningError(404, "Signer not found.");
    if (target.status === "signed") {
      throw new SigningError(
        409,
        "This signer has already signed and cannot be removed.",
      );
    }
    const remaining = request.signers.filter((s) => s.id !== target.id);
    if (!remaining.length) {
      throw new SigningError(
        409,
        "A signing request needs at least one signer.",
      );
    }
    const updated = await commitRequest(request, { signers: remaining }, [
      signingEvent("signer-removed", { ...meta, signerId: target.id }),
    ]);
    if (!updated) return null;

    // Removing the last unresponsive signer can leave everyone else already
    // signed, which should complete the request exactly like a normal sign does.
    const { request: after } = await finalizeIfComplete(updated);
    return after.status === "completed" ? after : notifyEligible(after);
  });

export const cancelSigningRequest = (
  payload: CancelSigningPayload,
  actor: Actor,
  meta: EventMeta = {},
): Promise<SigningRequest> =>
  withFreshRequest(payload.signingRequestId, async (request) => {
    if (request.status !== "sent") {
      throw new SigningError(409, "This signing request is not active.");
    }
    const now = new Date().toISOString();
    const revoked = request.signers.map((s) =>
      s.status === "pending" || s.status === "viewed"
        ? { ...s, tokenHash: null, tokenExpiresAt: null }
        : s,
    );
    return commitRequest(
      request,
      {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: actor.sub,
        signers: revoked,
      },
      [signingEvent("cancelled", { ...meta, actorName: actor.name }, now)],
    );
  });

/** Approver-only (see route): resend never itself waits on co-president approval. */
export const resendSignerToken = async (
  requestId: string,
  signerId: string,
  meta: EventMeta = {},
): Promise<void> => {
  await withFreshRequest(requestId, async (request) => {
    if (request.status !== "sent") {
      throw new SigningError(409, "This signing request is not active.");
    }
    const signer = request.signers.find((s) => s.id === signerId);
    if (!signer) throw new SigningError(404, "Signer not found.");
    if (signer.status === "signed" || signer.status === "declined") {
      throw new SigningError(409, "This signer has already responded.");
    }
    if (!signer.notifiedAt) {
      throw new SigningError(409, "It is not this signer's turn yet.");
    }
    const document = await findById<DocumentRecord>(
      documentsTable,
      request.documentId,
    );
    if (!document) throw new SigningError(404, "Document not found.");

    const target: Signer = { ...signer };
    const token = target.kind === "external" ? issueSignerToken() : null;
    if (token) {
      target.tokenHash = token.tokenHash;
      target.tokenExpiresAt = token.tokenExpiresAt;
    }
    const updated = await commitRequest(
      request,
      { signers: request.signers.map((s) => (s.id === signerId ? target : s)) },
      [signingEvent("resent", { ...meta, signerId })],
    );
    if (!updated) return null;
    if (token) {
      await notifyExternalSigner(target, token.raw, document, updated);
    } else {
      await notifyMemberSigner(target, document, updated);
    }
    return updated;
  });
};

/** Marks the signer viewed and logs it, the first time only. */
export const recordSignerView = (
  requestId: string,
  signerId: string,
  meta: EventMeta,
): Promise<SigningRequest> =>
  withFreshRequest(requestId, async (request) => {
    const signer = request.signers.find((s) => s.id === signerId);
    if (
      !signer ||
      signer.viewedAt ||
      request.status !== "sent" ||
      signer.status === "signed" ||
      signer.status === "declined"
    ) {
      return request;
    }
    const now = new Date().toISOString();
    const signers = request.signers.map((s) =>
      s.id === signerId
        ? { ...s, status: "viewed" as const, viewedAt: now }
        : s,
    );
    return commitRequest(request, { signers }, [
      signingEvent("viewed", { ...meta, signerId }, now),
    ]);
  });

/** Idempotent: a second call returns the first consent's timestamp. */
export const recordSignerConsent = (
  requestId: string,
  signerId: string,
  meta: EventMeta,
): Promise<{ consentedAt: string }> =>
  withFreshRequest(requestId, async (request) => {
    const signer = request.signers.find((s) => s.id === signerId);
    if (!signer) throw new SigningError(404, "Not found.");
    if (signer.consentedAt) return { consentedAt: signer.consentedAt };
    assertCanRespond(request, signer, { turn: false });
    const now = new Date().toISOString();
    const signers = request.signers.map((s) =>
      s.id === signerId ? { ...s, consentedAt: now, consentIp: meta.ip } : s,
    );
    const updated = await commitRequest(request, { signers }, [
      signingEvent("consented", { ...meta, signerId }, now),
    ]);
    return updated ? { consentedAt: now } : null;
  });

const assertCanRespond = (
  request: SigningRequestRecord,
  signer: Signer,
  { turn }: { turn: boolean },
) => {
  if (request.status !== "sent") {
    throw new SigningError(409, "This signing request is no longer open.");
  }
  if (signer.status === "signed" || signer.status === "declined") {
    throw new SigningError(409, "You have already responded to this request.");
  }
  if (turn && !isSignersTurn(request, signer.id)) {
    throw new SigningError(409, "It is not your turn to sign yet.");
  }
};

const signerIn = (request: SigningRequestRecord, signerId: string) => {
  const signer = request.signers.find((s) => s.id === signerId);
  if (!signer) throw new SigningError(404, "Not found.");
  return signer;
};

/** Everything but the commit: throws exactly what the commit would. */
const checkSignable = (
  request: SigningRequestRecord,
  signerId: string,
  submission: ParsedSubmission,
  signedAt: string,
) => {
  const signer = signerIn(request, signerId);
  assertCanRespond(request, signer, { turn: true });
  if (!signer.consentedAt) {
    throw new SigningError(
      409,
      "Agree to the Electronic Record and Signature Disclosure before signing.",
    );
  }
  return {
    signer,
    fieldValues: resolveFieldValues(
      fieldsForSigner(request, signerId),
      submission,
      signedAt,
    ),
  };
};

/**
 * Records a signature, then completes the request if that was the last one,
 * or notifies whoever is next. Drawn images are stored once, up front, so a
 * commit retry never writes them twice.
 */
export const signAsSigner = async (
  requestId: string,
  signerId: string,
  submission: ParsedSubmission,
  meta: EventMeta,
): Promise<FinalizeOutcome> => {
  checkSignable(
    await loadSigningRequest(requestId),
    signerId,
    submission,
    new Date().toISOString(),
  );

  const images: Pick<AdoptedSignature, "signatureImage" | "initialsImage"> = {};
  if (submission.style === "drawn") {
    if (submission.signaturePng) {
      images.signatureImage = (
        await storeDocumentBytes(submission.signaturePng, "image/png")
      ).storedFilename;
    }
    if (submission.initialsPng) {
      images.initialsImage = (
        await storeDocumentBytes(submission.initialsPng, "image/png")
      ).storedFilename;
    }
  }

  let signed: SigningRequest;
  try {
    signed = await withFreshRequest(requestId, async (request) => {
      const now = new Date().toISOString();
      const { signer, fieldValues } = checkSignable(
        request,
        signerId,
        submission,
        now,
      );
      const updatedSigner: Signer = {
        ...signer,
        status: "signed",
        signedAt: now,
        signatureText: submission.fullName,
        ip: meta.ip,
        userAgent: meta.userAgent,
        tokenHash: null,
        tokenExpiresAt: null,
        fieldValues: Object.keys(fieldValues).length ? fieldValues : undefined,
        adopted: {
          fullName: submission.fullName,
          initials: submission.initials,
          style: submission.style,
          font: submission.style === "typed" ? submission.font : undefined,
          ...images,
          adoptedAt: now,
        },
      };
      return commitRequest(
        request,
        {
          signers: request.signers.map((s) =>
            s.id === signerId ? updatedSigner : s,
          ),
        },
        [signingEvent("signed", { ...meta, signerId }, now)],
      );
    });
  } catch (err) {
    for (const file of Object.values(images)) {
      if (file) await deleteDocumentFile(file);
    }
    throw err;
  }

  const outcome = await finalizeIfComplete(signed);
  if (outcome.request.status === "completed") return outcome;
  return {
    request: await notifyEligible(outcome.request),
    viewTokens: new Map(),
  };
};

/** A decline halts the whole request, so every other outstanding link is revoked too. */
export const declineAsSigner = async (
  requestId: string,
  signerId: string,
  reason: string | undefined,
  meta: EventMeta,
): Promise<SigningRequest> => {
  const declined = await withFreshRequest(requestId, async (request) => {
    const signer = signerIn(request, signerId);
    assertCanRespond(request, signer, { turn: true });
    const now = new Date().toISOString();
    const signers = request.signers.map((s) => {
      if (s.id === signerId) {
        return {
          ...s,
          status: "declined" as const,
          declinedAt: now,
          declineReason: reason,
          ip: meta.ip,
          userAgent: meta.userAgent,
          tokenHash: null,
          tokenExpiresAt: null,
        };
      }
      return s.status === "pending" || s.status === "viewed"
        ? { ...s, tokenHash: null, tokenExpiresAt: null }
        : s;
    });
    return commitRequest(request, { signers, status: "declined" }, [
      signingEvent("declined", { ...meta, signerId }, now),
    ]);
  });

  const document = await findById<DocumentRecord>(
    documentsTable,
    declined.documentId,
  );
  const signer = declined.signers.find((s) => s.id === signerId);
  if (document && signer) {
    await notifyDeclined(
      [declined.createdByEmail ?? ""].filter(Boolean),
      document,
      signer,
    );
  }
  return declined;
};
