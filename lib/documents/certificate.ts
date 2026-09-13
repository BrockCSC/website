import type {
  DocumentRecord,
  DocumentVersionRecord,
  Signer,
  SigningRequestRecord,
} from "@/lib/api/types";
import type { Entity } from "@/lib/db/repository";

const signerLine = (signer: Signer): string => {
  const who =
    signer.kind === "member"
      ? `${signer.name ?? "Member"} (portal member)`
      : `${signer.name ?? "Signer"} <${signer.email ?? "no email"}> (external)`;
  if (signer.status === "signed") {
    return [
      `  - ${who}`,
      `    Signed: "${signer.signatureText ?? ""}" at ${signer.signedAt}`,
      `    IP: ${signer.ip ?? "unknown"}  User-Agent: ${signer.userAgent ?? "unknown"}`,
    ].join("\n");
  }
  if (signer.status === "declined") {
    return [
      `  - ${who}`,
      `    Declined at ${signer.declinedAt}: ${signer.declineReason ?? "No reason given."}`,
    ].join("\n");
  }
  return `  - ${who}\n    Status: ${signer.status}`;
};

/**
 * A plain-text completion record, not a stamp on the original document (that
 * is explicitly out of scope for v1). It stands alone as a new version
 * alongside the source file, both traceable through their sha256 below.
 */
export const buildCompletionCertificate = (
  document: DocumentRecord,
  sourceVersion: Entity<DocumentVersionRecord>,
  request: Entity<SigningRequestRecord>,
): string =>
  [
    "BrockCSC Document Library — signing completion record",
    "",
    "This is an internal club record of a signing process. It is NOT a",
    "certified or compliance-grade electronic signature (no eIDAS/ESIGN-Act",
    "certification, no cryptographic non-repudiation). The hash below only",
    "detects accidental tampering with this record after the fact.",
    "",
    `Document: ${document.title} [${document.category}]`,
    `Signing request: ${request.title} (${request.mode})`,
    `Original file: ${sourceVersion.originalFilename}`,
    `Original sha256: ${sourceVersion.sha256}`,
    `Requested by: ${request.createdByName ?? request.createdBy} at ${request.createdAt}`,
    `Completed: ${new Date().toISOString()}`,
    "",
    "Signers:",
    ...request.signers
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(signerLine),
    "",
  ].join("\n");
