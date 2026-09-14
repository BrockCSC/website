import type { SigningEvent } from "@/lib/api/types";
import type { StampSigner } from "./signed-pdf";

export type CertificateSigner = StampSigner & {
  email?: string;
  kind: "member" | "external";
  order: number;
  sentAt?: string;
  viewedAt?: string;
  consentedAt?: string;
  ip?: string;
  userAgent?: string;
};

export type CertificateInput = {
  envelopeId: string;
  subject: string;
  documentTitle: string;
  sourceFilename: string;
  sourcePageCount: number;
  sourceSha256: string;
  signedSha256: string;
  originator: { name: string; email?: string; ip?: string };
  createdAt: string;
  completedAt: string;
  mode: "ordered" | "parallel";
  signers: CertificateSigner[];
  events: SigningEvent[];
  signatureCount: number;
  initialsCount: number;
  disclosureVersion: string;
  disclosureText: string;
};

/** BrockCSC-branded Certificate of Completion, laid out like an e-signature platform's completion certificate. */
export const buildCertificatePdf = async (
  input: CertificateInput,
): Promise<Uint8Array> => {
  void input;
  throw new Error("buildCertificatePdf is not implemented yet");
};
