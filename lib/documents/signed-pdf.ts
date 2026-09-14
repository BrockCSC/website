import type { SignatureFontId, SigningFieldType } from "@/lib/api/types";

export type StampSigner = {
  id: string;
  fullName: string;
  initials: string;
  style: "typed" | "drawn";
  font?: SignatureFontId;
  /** Raw PNG bytes, drawn style only. */
  signaturePng?: Uint8Array;
  initialsPng?: Uint8Array;
  /** ISO timestamp; the stamped Date Signed is this, formatted in SIGNING_TIME_ZONE. */
  signedAt: string;
};

export type StampField = {
  id: string;
  type: SigningFieldType;
  page: number;
  /** Centre of the field as a % of the pdfjs viewport (scale-independent, already reflects /Rotate). */
  xPercent: number;
  yPercent: number;
  signerId: string;
  /** Text fields only. */
  value?: string;
};

export type SignedPdfInput = {
  sourcePdf: Uint8Array;
  envelopeId: string;
  signers: StampSigner[];
  fields: StampField[];
};

/** The source PDF with every field stamped in place and the envelope id on each page. */
export const buildSignedPdf = async (
  input: SignedPdfInput,
): Promise<Uint8Array> => {
  void input;
  throw new Error("buildSignedPdf is not implemented yet");
};
