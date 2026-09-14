import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit, { type Font as FontMetrics } from "@pdf-lib/fontkit";
import {
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
  rgb,
} from "pdf-lib";
import type { SignatureFontId } from "@/lib/api/types";
import { SIGNATURE_FONTS, SIGNING_TIME_ZONE } from "./fields";

const hexColor = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );

export const INK = hexColor("#1b2a4e");
export const MUTED = hexColor("#6b7280");
const FRAME = hexColor("#9ca3af");

type FontFile = { bytes: Uint8Array; metrics: FontMetrics };

const fontFiles = new Map<string, Promise<FontFile>>();

/** Read from the working directory at runtime; the Dockerfile copies lib/documents/fonts into the image. */
const loadFontFile = (file: string) => {
  let cached = fontFiles.get(file);
  if (!cached) {
    cached = readFile(join(process.cwd(), "lib/documents/fonts", file)).then(
      (bytes) => ({ bytes, metrics: fontkit.create(bytes) }),
    );
    cached.catch(() => fontFiles.delete(file));
    fontFiles.set(file, cached);
  }
  return cached;
};

export type EmbeddedFont = { pdf: PDFFont; metrics: FontMetrics };

export type SigningFonts = {
  sans: EmbeddedFont;
  bold: EmbeddedFont;
  script: (id: SignatureFontId | undefined) => Promise<EmbeddedFont>;
};

export const embedSigningFonts = async (
  doc: PDFDocument,
): Promise<SigningFonts> => {
  doc.registerFontkit(fontkit);
  const embed = async (file: string): Promise<EmbeddedFont> => {
    const { bytes, metrics } = await loadFontFile(file);
    return { pdf: await doc.embedFont(bytes, { subset: true }), metrics };
  };
  // The hinted Noto Sans build: the unhinted one has odd-length glyphs, which fontkit's subsetter misaligns.
  const [sans, bold] = await Promise.all([
    embed("NotoSans-Regular.ttf"),
    embed("NotoSans-Bold.ttf"),
  ]);
  const scripts = new Map<string, Promise<EmbeddedFont>>();
  const script = (id: SignatureFontId | undefined) => {
    const { ttfFile } =
      SIGNATURE_FONTS.find((f) => f.id === id) ?? SIGNATURE_FONTS[0];
    let cached = scripts.get(ttfFile);
    if (!cached) {
      cached = embed(ttfFile);
      scripts.set(ttfFile, cached);
    }
    return cached;
  };
  return { sans, bold, script };
};

export const singleLine = (text: string) =>
  text.replace(/[\p{Cc}\p{Z}]+/gu, " ").trim();

const covers = (font: EmbeddedFont, text: string) =>
  [...text].every(
    (ch) => ch === " " || font.metrics.hasGlyphForCodePoint(ch.codePointAt(0)!),
  );

/** A script font missing a glyph (say, a Cyrillic name in Great Vibes) falls back to the sans. */
export const fontFor = (
  preferred: EmbeddedFont,
  fallback: EmbeddedFont,
  text: string,
) => (covers(preferred, text) ? preferred : fallback);

const capHeight = (font: EmbeddedFont) =>
  (font.metrics.capHeight || font.metrics.unitsPerEm * 0.7) /
  font.metrics.unitsPerEm;

/** Ink extent of `text` at size 1, measured the way pdf-lib advances glyphs (no GPOS). */
const inkBox = (font: EmbeddedFont, text: string) => {
  const { glyphs } = font.metrics.layout(text);
  let x = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const glyph of glyphs) {
    const box = glyph.bbox;
    if (Number.isFinite(box.minX) && box.maxX > box.minX) {
      minX = Math.min(minX, x + box.minX);
      maxX = Math.max(maxX, x + box.maxX);
      minY = Math.min(minY, box.minY);
      maxY = Math.max(maxY, box.maxY);
    }
    x += glyph.advanceWidth;
  }
  if (!Number.isFinite(minX)) return null;
  const scale = 1 / font.metrics.unitsPerEm;
  return {
    minX: minX * scale,
    maxX: maxX * scale,
    minY: minY * scale,
    maxY: maxY * scale,
  };
};

type Rect = { x: number; y: number; width: number; height: number };

/** Draws `text` so its ink is centred in `rect`, at the largest size up to `maxSize` that fits. */
const drawInkFitted = (
  page: PDFPage,
  font: EmbeddedFont,
  text: string,
  rect: Rect,
  maxSize: number,
  color: RGB,
) => {
  const ink = inkBox(font, text);
  if (!ink) return;
  const inkWidth = ink.maxX - ink.minX;
  const inkHeight = ink.maxY - ink.minY;
  const size = Math.min(
    maxSize,
    rect.width / inkWidth,
    rect.height / inkHeight,
  );
  page.drawText(text, {
    x: rect.x + (rect.width - inkWidth * size) / 2 - ink.minX * size,
    y: rect.y + (rect.height - inkHeight * size) / 2 - ink.minY * size,
    size,
    font: font.pdf,
    color,
  });
};

/** Single line, centred horizontally on cx and vertically on the cap height around cy. */
export const drawCenteredLine = (
  page: PDFPage,
  font: EmbeddedFont,
  text: string,
  cx: number,
  cy: number,
  size: number,
  color: RGB,
) => {
  const width = font.pdf.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: cx - width / 2,
    y: cy - (capHeight(font) * size) / 2,
    size,
    font: font.pdf,
    color,
  });
};

/** Greedy word wrap; words longer than the line are broken by character. */
export const wrapText = (
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] => {
  const width = (value: string) => font.widthOfTextAtSize(value, size);
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    let piece = "";
    for (const ch of word) {
      if (piece && width(piece + ch) > maxWidth) {
        lines.push(piece);
        piece = "";
      }
      piece += ch;
    }
    current = piece;
  }
  if (current) lines.push(current);
  return lines;
};

/** First 16 hex characters of sha256(envelopeId + signerId + signedAt), uppercase. */
export const signatureShortId = (
  envelopeId: string,
  signerId: string,
  signedAt: string,
) =>
  createHash("sha256")
    .update(envelopeId + signerId + signedAt)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

export type MarkContent =
  | { kind: "typed"; text: string; font: EmbeddedFont }
  | { kind: "image"; image: PDFImage };

const MARK_LABEL_SIZE = 5.5;

/** The framed signature or initials: bracket, "Signed by:" on the top arm, the short id on the bottom arm. */
export const drawSignatureMark = (
  page: PDFPage,
  sans: EmbeddedFont,
  rect: Rect,
  content: MarkContent,
  shortId: string,
) => {
  const { x, y, width, height } = rect;
  const arm = 4;
  const radius = 3;
  page.drawSvgPath(
    `M ${arm + 2} ${arm} L ${radius + 0.5} ${arm} Q 0.5 ${arm} 0.5 ${arm + radius}` +
      ` L 0.5 ${height - arm - radius} Q 0.5 ${height - arm} ${radius + 0.5} ${height - arm}` +
      ` L ${arm + 2} ${height - arm}`,
    { x, y: y + height, borderColor: FRAME, borderWidth: 0.75 },
  );
  const labelOffset = (capHeight(sans) * MARK_LABEL_SIZE) / 2;
  const textX = x + arm + 3.5;
  page.drawText("Signed by:", {
    x: textX,
    y: y + height - arm - labelOffset,
    size: MARK_LABEL_SIZE,
    font: sans.pdf,
    color: MUTED,
  });
  page.drawText(shortId, {
    x: textX,
    y: y + arm - labelOffset,
    size: MARK_LABEL_SIZE,
    font: sans.pdf,
    color: MUTED,
  });

  const band: Rect = {
    x: x + arm + 2,
    y: y + arm + 4,
    width: width - arm - 4,
    height: height - 2 * (arm + 4),
  };
  if (content.kind === "typed") {
    drawInkFitted(page, content.font, content.text, band, 26, INK);
    return;
  }
  const { image } = content;
  const scale = Math.min(band.width / image.width, band.height / image.height);
  page.drawImage(image, {
    x: band.x + (band.width - image.width * scale) / 2,
    y: band.y + (band.height - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
};

const zonedParts = (iso: string, withSeconds: boolean) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SIGNING_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("month")}/${part("day")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}${withSeconds ? `:${part("second")}` : ""} ${part("dayPeriod").toUpperCase()}`,
  };
};

/** "9/14/2026" in SIGNING_TIME_ZONE. */
export const formatSigningDate = (iso: string) =>
  zonedParts(iso, false)?.date ?? "";

/** "9/14/2026 | 12:42 AM", or "9/14/2026 12:42:10 AM" with seconds. */
export const formatSigningTimestamp = (iso: string, withSeconds = false) => {
  const parts = zonedParts(iso, withSeconds);
  if (!parts) return "";
  return withSeconds
    ? `${parts.date} ${parts.time}`
    : `${parts.date} | ${parts.time}`;
};
