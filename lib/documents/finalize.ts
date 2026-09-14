import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  SIGNATURE_FONT_IDS,
  type DocumentRecord,
  type DocumentVersionRecord,
  type Signer,
  type SigningEvent,
  type SigningRequestRecord,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import { type Entity, create, findById, remove } from "@/lib/db/repository";
import { documentsTable, documentVersionsTable } from "@/lib/db/schema";
import { buildCompletionCertificate } from "./certificate";
import { type CertificateSigner, buildCertificatePdf } from "./certificate-pdf";
import { DISCLOSURE_FULL, DISCLOSURE_VERSION } from "./disclosure";
import {
  commitRequest,
  envelopeIdFor,
  loadSigningRequest,
  signingEvent,
} from "./envelope";
import {
  envelopeCompletedEmails,
  memberClubAddress,
  sendNotifications,
} from "./notify";
import {
  type StampField,
  type StampSigner,
  buildSignedPdf,
} from "./signed-pdf";
import {
  deleteDocumentFile,
  readDocumentBytes,
  storeDocumentBytes,
} from "./storage";
import { issueViewToken } from "./tokens";

type SigningRequest = Entity<SigningRequestRecord>;

const RETRY_INTERVAL_MS = 60 * 1000;

/** Per process, like lib/rate-limit.ts: one container per environment. */
const lastAttemptAt = new Map<string, number>();

export type FinalizeOutcome = {
  request: SigningRequest;
  /** Raw read-only view tokens for external signers, by signer id. Only set by the call that completed it. */
  viewTokens: Map<string, string>;
};

type Artifact = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  note: string;
};

const isFullySigned = (request: SigningRequestRecord) =>
  request.status === "sent" &&
  request.signers.length > 0 &&
  request.signers.every((s) => s.status === "signed");

const isFollowUpPending = (request: SigningRequestRecord) =>
  request.status === "completed" && request.completionFollowUpPending === true;

/** Fresh read-only view tokens for every external signer; the raw values land in `into`. */
const withViewTokens = (signers: Signer[], into: Map<string, string>) =>
  signers.map((signer) => {
    if (signer.kind !== "external") return signer;
    const { raw, viewTokenHash, viewTokenExpiresAt } = issueViewToken();
    into.set(signer.id, raw);
    return { ...signer, viewTokenHash, viewTokenExpiresAt };
  });

const initialsOf = (fullName: string) =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("") || "X";

/** Signers who signed before adopted signatures existed are stamped in the first typed style. */
const stampSignerFor = async (
  signer: Signer,
  fallbackAt: string,
): Promise<StampSigner> => {
  const adopted = signer.adopted;
  const fullName =
    adopted?.fullName ?? signer.signatureText ?? signer.name ?? "Signer";
  const drawn = adopted?.style === "drawn";
  return {
    id: signer.id,
    fullName,
    initials: adopted?.initials ?? initialsOf(fullName),
    style: drawn ? "drawn" : "typed",
    font: drawn ? undefined : (adopted?.font ?? SIGNATURE_FONT_IDS[0]),
    signaturePng:
      drawn && adopted.signatureImage
        ? await readDocumentBytes(adopted.signatureImage)
        : undefined,
    initialsPng:
      drawn && adopted.initialsImage
        ? await readDocumentBytes(adopted.initialsImage)
        : undefined,
    signedAt: signer.signedAt ?? fallbackAt,
  };
};

const firstEventAt = (
  events: SigningEvent[],
  type: SigningEvent["type"],
  signerId: string,
) => events.find((e) => e.type === type && e.signerId === signerId)?.at;

const buildPdfArtifacts = async (
  request: SigningRequest,
  document: DocumentRecord,
  source: Entity<DocumentVersionRecord>,
  completedEvent: SigningEvent,
): Promise<{ signed: Artifact; certificate: Artifact }> => {
  const now = completedEvent.at;
  const envelopeId = envelopeIdFor(request);
  const sourcePdf = await readDocumentBytes(source.storedFilename);
  const sourcePageCount = (
    await PDFDocument.load(sourcePdf, {
      ignoreEncryption: true,
      updateMetadata: false,
    })
  ).getPageCount();

  const signers = request.signers.slice().sort((a, b) => a.order - b.order);
  const stampSigners = await Promise.all(
    signers.map((s) => stampSignerFor(s, now)),
  );
  const signerById = new Map(signers.map((s) => [s.id, s]));
  // A removed signer's fields stay on the row but must never be stamped.
  const fields: StampField[] = (request.fields ?? [])
    .filter((f) => signerById.has(f.signerId) && f.page <= sourcePageCount)
    .map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      xPercent: f.xPercent,
      yPercent: f.yPercent,
      signerId: f.signerId,
      value:
        f.type === "text"
          ? signerById.get(f.signerId)?.fieldValues?.[f.id]
          : undefined,
    }))
    .filter((f) => f.type !== "text" || !!f.value);

  const signedBytes = await buildSignedPdf({
    sourcePdf,
    envelopeId,
    signers: stampSigners,
    fields,
  });

  const events = [...(request.events ?? []), completedEvent];
  const certificateSigners: CertificateSigner[] = await Promise.all(
    signers.map(async (signer, index) => ({
      ...stampSigners[index],
      email:
        signer.kind === "external"
          ? signer.email
          : signer.signupId
            ? await memberClubAddress(signer.signupId)
            : undefined,
      kind: signer.kind,
      order: signer.order,
      sentAt: firstEventAt(events, "sent", signer.id) ?? signer.notifiedAt,
      viewedAt: signer.viewedAt ?? firstEventAt(events, "viewed", signer.id),
      consentedAt: signer.consentedAt,
      ip: signer.ip,
      userAgent: signer.userAgent,
    })),
  );

  const signedSha256 = createHash("sha256").update(signedBytes).digest("hex");

  const certificateBytes = await buildCertificatePdf({
    envelopeId,
    subject: request.title,
    documentTitle: document.title,
    sourceFilename: source.originalFilename,
    sourcePageCount,
    sourceSha256: source.sha256,
    signedSha256,
    originator: {
      name: request.createdByName || "BrockCSC",
      email: request.createdByEmail,
      ip: request.createdByIp,
    },
    createdAt: request.createdAt,
    completedAt: now,
    mode: request.mode,
    signers: certificateSigners,
    events,
    signatureCount: fields.filter((f) => f.type === "signature").length,
    initialsCount: fields.filter((f) => f.type === "initials").length,
    disclosureVersion: DISCLOSURE_VERSION,
    disclosureText: DISCLOSURE_FULL,
  });

  return {
    signed: {
      bytes: signedBytes,
      contentType: "application/pdf",
      filename: `${request.title} - signed.pdf`,
      note: "Signed copy, stamped by BrockCSC Sign.",
    },
    certificate: {
      bytes: certificateBytes,
      contentType: "application/pdf",
      filename: `${request.title} - Certificate of Completion.pdf`,
      note: "Certificate of Completion, generated by BrockCSC Sign.",
    },
  };
};

/**
 * A request started before uploads were PDF-only can't be stamped, so it
 * finishes the old way: the text completion record, with the source file
 * standing in as the signed copy.
 */
const buildLegacyCertificate = (
  request: SigningRequest,
  document: DocumentRecord,
  source: Entity<DocumentVersionRecord>,
): Artifact => ({
  bytes: new TextEncoder().encode(
    buildCompletionCertificate(document, source, request),
  ),
  contentType: "text/plain",
  filename: `${request.title} - signing certificate.txt`,
  note: "Generated signing completion record.",
});

/**
 * Completes a fully-signed request: stamps the PDF, builds the certificate,
 * stores both as versions, and moves the document onto the signed copy. Safe
 * to call again at any time: it does nothing unless the request is fully
 * signed and still open. If building fails, every signature stays recorded,
 * the request stays "sent", and a later call tries again.
 */
export const finalizeIfComplete = async (
  request: SigningRequest,
): Promise<FinalizeOutcome> => {
  const unchanged: FinalizeOutcome = { request, viewTokens: new Map() };
  if (!isFullySigned(request)) return unchanged;
  lastAttemptAt.set(request.id, Date.now());

  const storedFiles: string[] = [];
  const createdVersions: string[] = [];
  const discard = async () => {
    for (const id of createdVersions) {
      await remove(documentVersionsTable, id).catch(() => false);
    }
    for (const file of storedFiles) await deleteDocumentFile(file);
  };
  const storeVersion = async (
    documentId: string,
    artifact: Artifact,
    uploadedAt: string,
  ) => {
    const { storedFilename, sha256 } = await storeDocumentBytes(
      artifact.bytes,
      artifact.contentType,
    );
    storedFiles.push(storedFilename);
    const version = await create<DocumentVersionRecord>(documentVersionsTable, {
      documentId,
      storedFilename,
      originalFilename: artifact.filename,
      contentType: artifact.contentType,
      size: artifact.bytes.byteLength,
      sha256,
      uploadedBy: request.createdBy,
      uploadedByName: request.createdByName,
      uploadedAt,
      note: artifact.note,
      producedBySigningRequestId: request.id,
    });
    createdVersions.push(version.id);
    return version;
  };

  const completedEvent = signingEvent("completed");
  const now = completedEvent.at;
  const viewTokens = new Map<string, string>();
  let completed: SigningRequest | null;
  try {
    const document = await findById<DocumentRecord>(
      documentsTable,
      request.documentId,
    );
    const source = await findById<DocumentVersionRecord>(
      documentVersionsTable,
      request.sourceVersionId,
    );
    if (!document || !source) {
      throw new Error("the document or its source version is missing");
    }

    let patch: Partial<SigningRequestRecord>;
    if (source.contentType === "application/pdf") {
      const artifacts = await buildPdfArtifacts(
        request,
        document,
        source,
        completedEvent,
      );
      const signed = await storeVersion(document.id, artifacts.signed, now);
      const certificate = await storeVersion(
        document.id,
        artifacts.certificate,
        now,
      );
      patch = {
        resultingVersionId: signed.id,
        sha256: signed.sha256,
        certificateVersionId: certificate.id,
        certificateSha256: certificate.sha256,
      };
    } else {
      const record = await storeVersion(
        document.id,
        buildLegacyCertificate(request, document, source),
        now,
      );
      patch = { resultingVersionId: record.id, sha256: record.sha256 };
    }

    completed = await commitRequest(
      request,
      {
        ...patch,
        signers: withViewTokens(request.signers, viewTokens),
        status: "completed",
        completedAt: now,
        completionFollowUpPending: true,
      },
      [completedEvent],
    );
  } catch (err) {
    await discard();
    console.error(
      `documents: could not complete signing request ${request.id}, will retry: ${err instanceof Error ? (err.stack ?? err.message) : err}`,
    );
    return unchanged;
  }

  // Lost the race: whoever won already completed it (or changed the signers).
  if (!completed) {
    await discard();
    return {
      request: await loadSigningRequest(request.id).catch(() => request),
      viewTokens: new Map(),
    };
  }

  return { request: await finishFollowUp(completed, viewTokens), viewTokens };
};

/** Guarded on the source version, so a late retry never rolls back a version uploaded since. */
const moveDocumentOntoResult = async (request: SigningRequestRecord) => {
  if (!request.resultingVersionId) return;
  const table = documentsTable;
  const patch = { currentVersionId: request.resultingVersionId };
  await db
    .update(table)
    .set({ data: sql`${table.data} || ${JSON.stringify(patch)}::jsonb` })
    .where(
      and(
        eq(table.id, request.documentId),
        sql`${table.data}->>'currentVersionId' = ${request.sourceVersionId}`,
      ),
    );
};

/**
 * After the completing commit: moves the document onto the signed copy,
 * emails everyone, then clears completionFollowUpPending. Nothing is sent
 * until every address is looked up and the flag is cleared, so a failure
 * sends nothing and a later read retries the lot. Raw view tokens only live
 * in the call that completed it, so a retry mints fresh ones for the emails.
 */
const finishFollowUp = async (
  request: SigningRequest,
  issued?: Map<string, string>,
): Promise<SigningRequest> => {
  lastAttemptAt.set(request.id, Date.now());
  try {
    await moveDocumentOntoResult(request);
    const viewTokens = issued ?? new Map<string, string>();
    const signers = issued
      ? request.signers
      : withViewTokens(request.signers, viewTokens);
    const document = await findById<DocumentRecord>(
      documentsTable,
      request.documentId,
    );
    const emails = document
      ? await envelopeCompletedEmails(
          document,
          { ...request, signers },
          viewTokens,
        )
      : [];
    const done = await commitRequest(request, {
      signers,
      completionFollowUpPending: false,
    });
    if (!done) return await loadSigningRequest(request.id);
    lastAttemptAt.delete(request.id);
    sendNotifications(emails);
    return done;
  } catch (err) {
    console.error(
      `documents: signing request ${request.id} completed, but moving the document or emailing everyone failed, will retry: ${err instanceof Error ? (err.stack ?? err.message) : err}`,
    );
    return request;
  }
};

/** For read paths: retries a completion, or its follow-up, that failed earlier; at most once a minute per request. */
export const retryStuckCompletion = async (
  request: SigningRequest,
): Promise<SigningRequest> => {
  const followUp = isFollowUpPending(request);
  if (!followUp && !isFullySigned(request)) return request;
  const last = lastAttemptAt.get(request.id);
  if (last && Date.now() - last < RETRY_INTERVAL_MS) return request;
  return followUp
    ? finishFollowUp(request)
    : (await finalizeIfComplete(request)).request;
};
