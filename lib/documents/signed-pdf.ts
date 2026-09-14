import { PDFDocument, type PDFImage } from "pdf-lib";
import type { SignatureFontId, SigningFieldType } from "@/lib/api/types";
import { drawUpright, readPageFrame } from "./pdf-geometry";
import {
  INK,
  MUTED,
  type MarkContent,
  type SigningFonts,
  drawCenteredLine,
  drawSignatureMark,
  embedSigningFonts,
  fontFor,
  formatSigningDate,
  signatureShortId,
  singleLine,
  wrapText,
} from "./signature-marks";

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

const MARK_SIZE = {
  signature: { width: 170, height: 44 },
  initials: { width: 70, height: 34 },
};
const TEXT_SIZE = 10;
const HEADER_SIZE = 7;
const EDGE = 2;

const clamp = (value: number, min: number, max: number) =>
  max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value));

/** Typed or drawn, for one signer's signature or initials; drawn without a PNG falls back to typed. */
export const markContent = async (
  doc: PDFDocument,
  fonts: SigningFonts,
  images: Map<Uint8Array, Promise<PDFImage>>,
  signer: StampSigner,
  kind: "signature" | "initials",
): Promise<MarkContent | null> => {
  const png = kind === "signature" ? signer.signaturePng : signer.initialsPng;
  if (signer.style === "drawn" && png?.byteLength) {
    let image = images.get(png);
    if (!image) {
      image = doc.embedPng(png);
      images.set(png, image);
    }
    return { kind: "image", image: await image };
  }
  const text = singleLine(
    kind === "signature" ? signer.fullName : signer.initials,
  );
  if (!text) return null;
  const script = await fonts.script(signer.font);
  return { kind: "typed", text, font: fontFor(script, fonts.sans, text) };
};

/** The source PDF with every field stamped in place and the envelope id on each page. */
export const buildSignedPdf = async (
  input: SignedPdfInput,
): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(input.sourcePdf, {
    updateMetadata: false,
  });
  const fonts = await embedSigningFonts(doc);
  const signers = new Map(input.signers.map((s) => [s.id, s]));
  const images = new Map<Uint8Array, Promise<PDFImage>>();
  const pages = doc.getPages();
  const header = singleLine(`BrockCSC Sign Envelope ID: ${input.envelopeId}`);

  for (const field of input.fields) {
    if (
      !Number.isInteger(field.page) ||
      field.page < 1 ||
      field.page > pages.length ||
      !Number.isFinite(field.xPercent) ||
      !Number.isFinite(field.yPercent)
    ) {
      throw new Error(
        `Field ${field.id} is not on the document (page ${field.page} of ${pages.length}).`,
      );
    }
  }

  for (const [index, page] of pages.entries()) {
    const frame = readPageFrame(page);
    // Resolve fonts and images first so the upright block below is synchronous.
    const stamps = await Promise.all(
      input.fields
        .filter((f) => f.page === index + 1 && signers.has(f.signerId))
        .map(async (field) => {
          const signer = signers.get(field.signerId)!;
          const content =
            field.type === "signature" || field.type === "initials"
              ? await markContent(doc, fonts, images, signer, field.type)
              : null;
          return { field, signer, content };
        }),
    );

    drawUpright(page, frame, () => {
      const headerSize = Math.min(
        HEADER_SIZE,
        (HEADER_SIZE * (frame.width - 24)) /
          fonts.sans.pdf.widthOfTextAtSize(header, HEADER_SIZE),
      );
      if (headerSize >= 3) {
        page.drawText(header, {
          x: 12,
          y: frame.height - 10 - headerSize,
          size: headerSize,
          font: fonts.sans.pdf,
          color: MUTED,
        });
      }

      for (const { field, signer, content } of stamps) {
        const cx = (field.xPercent / 100) * frame.width;
        const cy = (1 - field.yPercent / 100) * frame.height;

        if (field.type === "signature" || field.type === "initials") {
          if (!content) continue;
          const { width, height } = MARK_SIZE[field.type];
          drawSignatureMark(
            page,
            fonts.sans,
            {
              x: clamp(cx - width / 2, EDGE, frame.width - EDGE - width),
              y: clamp(cy - height / 2, EDGE, frame.height - EDGE - height),
              width,
              height,
            },
            content,
            signatureShortId(input.envelopeId, signer.id, signer.signedAt),
          );
          continue;
        }

        const text = singleLine(
          field.type === "date"
            ? field.value || formatSigningDate(signer.signedAt)
            : field.type === "name"
              ? signer.fullName
              : (field.value ?? ""),
        );
        if (!text) continue;
        const font = fonts.sans;
        const maxWidth = Math.min(240, frame.width - 2 * EDGE);
        // Date and name shrink to stay on one line; free text wraps first.
        let size =
          field.type === "text"
            ? TEXT_SIZE
            : Math.max(
                6,
                Math.min(
                  TEXT_SIZE,
                  (TEXT_SIZE * maxWidth) /
                    font.pdf.widthOfTextAtSize(text, TEXT_SIZE),
                ),
              );
        let lines = wrapText(font.pdf, text, size, maxWidth);
        while (lines.length > 3 && size > 7) {
          size -= 1;
          lines = wrapText(font.pdf, text, size, maxWidth);
        }
        const leading = size * 1.25;
        const widest = Math.max(
          ...lines.map((line) => font.pdf.widthOfTextAtSize(line, size)),
        );
        const blockHeight = leading * lines.length;
        const x = clamp(cx, EDGE + widest / 2, frame.width - EDGE - widest / 2);
        const top = clamp(
          cy + blockHeight / 2,
          EDGE + blockHeight,
          frame.height - EDGE,
        );
        lines.forEach((line, i) => {
          drawCenteredLine(
            page,
            font,
            line,
            x,
            top - leading / 2 - i * leading,
            size,
            INK,
          );
        });
      }
    });
  }

  doc.setProducer("BrockCSC Sign");
  const signedTimes = input.signers
    .map((s) => new Date(s.signedAt).getTime())
    .filter(Number.isFinite);
  if (signedTimes.length) {
    doc.setModificationDate(new Date(Math.max(...signedTimes)));
  }
  return doc.save();
};
