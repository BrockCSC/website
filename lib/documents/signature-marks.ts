// @pdf-lib/fontkit's Indic and Khmer shapers call a global regeneratorRuntime that nothing else defines.
import "regenerator-runtime/runtime";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit, {
  type Font as FontMetrics,
  type Glyph,
  type TypeFeatures,
} from "@pdf-lib/fontkit";
import {
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  type PDFRef,
  type RGB,
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  drawObject,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
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

/** Tried in order after Noto Sans; a file is only read once some text has a character in its scripts. */
const FALLBACK_FONTS: { file: string; scripts: RegExp; outlines?: true }[] = [
  ...[
    "Arabic",
    "Hebrew",
    "Devanagari",
    "Bengali",
    "Gurmukhi",
    "Gujarati",
    "Oriya",
    "Tamil",
    "Telugu",
    "Kannada",
    "Malayalam",
    "Sinhala",
    "Thai",
    "Lao",
    "Khmer",
    "Myanmar",
    "Armenian",
    "Georgian",
    "Ethiopic",
    "Canadian_Aboriginal",
  ].map((script) => ({
    file: `NotoSans${script.replace("_", "")}-Regular.ttf`,
    scripts: new RegExp(`\\p{scx=${script}}`, "u"),
  })),
  // fontkit's CFF subsetter scrambles these fonts' glyphs, so they are drawn as outlines instead of text.
  {
    file: "NotoSansSC-Regular.otf",
    scripts: /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Bopomofo}]/u,
    outlines: true,
  },
  {
    file: "NotoSansKR-Regular.otf",
    scripts: /\p{scx=Hangul}/u,
    outlines: true,
  },
];

/** pdf-lib draws plain glyph advances, so positioning changes nothing, and some Indic fonts' null anchors crash it. */
const LAYOUT_FEATURES: TypeFeatures = {
  kern: false,
  mark: false,
  mkmk: false,
  curs: false,
  dist: false,
  abvm: false,
  blwm: false,
};

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

const IGNORABLE = /[\s\p{Default_Ignorable_Code_Point}]/u;
const ATTACHED = /[\p{M}\p{Default_Ignorable_Code_Point}]/u;

const hasGlyph = (metrics: FontMetrics, ch: string) =>
  IGNORABLE.test(ch) || metrics.hasGlyphForCodePoint(ch.codePointAt(0)!);

const covers = (metrics: FontMetrics, text: string) =>
  [...text].every((ch) => hasGlyph(metrics, ch));

/** Index of the first font with every glyph in `text`, else of the one missing the fewest. */
const closestFont = (text: string, fonts: FontMetrics[]) => {
  const chars = [...text];
  let best = 0;
  let bestCount = -1;
  for (const [index, metrics] of fonts.entries()) {
    const count = chars.filter((ch) => hasGlyph(metrics, ch)).length;
    if (count === chars.length) return index;
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  }
  return best;
};

export type EmbeddedFont = {
  metrics: FontMetrics;
  /** Advance width of `text`, the way pdf-lib measures it. */
  width: (text: string, size: number) => number;
  draw: (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    color: RGB,
  ) => void;
};

type TextFont = EmbeddedFont & { pdf: PDFFont };

const textFont = (pdf: PDFFont, metrics: FontMetrics): TextFont => ({
  pdf,
  metrics,
  width: (text, size) => pdf.widthOfTextAtSize(text, size),
  draw: (page, text, x, y, size, color) =>
    page.drawText(text, { x, y, size, font: pdf, color }),
});

/** A glyph's path in font units; quadratic segments become cubics, which is all PDF has. */
const glyphOperators = (glyph: Glyph) => {
  const ops: PDFOperator[] = [];
  let [cx, cy] = [0, 0];
  const at = (x: number, y: number, op: PDFOperator) => {
    ops.push(op);
    [cx, cy] = [x, y];
  };
  glyph.path.toFunction()({
    moveTo: (x: number, y: number) => at(x, y, moveTo(x, y)),
    lineTo: (x: number, y: number) => at(x, y, lineTo(x, y)),
    bezierCurveTo: (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x: number,
      y: number,
    ) => at(x, y, appendBezierCurve(x1, y1, x2, y2, x, y)),
    quadraticCurveTo: (qx: number, qy: number, x: number, y: number) =>
      at(
        x,
        y,
        appendBezierCurve(
          cx + (2 / 3) * (qx - cx),
          cy + (2 / 3) * (qy - cy),
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          x,
          y,
        ),
      ),
    closePath: () => ops.push(closePath()),
  });
  ops.push(fill());
  return ops;
};

/** Draws each glyph as a filled outline, stored once per document as a form XObject. */
const outlineFont = (doc: PDFDocument, metrics: FontMetrics): EmbeddedFont => {
  const forms = new Map<number, PDFRef>();
  const names = new Map<PDFPage, Map<number, PDFName>>();
  const glyphs = (text: string) => metrics.layout(text, LAYOUT_FEATURES).glyphs;
  const { minX, minY, maxX, maxY } = metrics.bbox;
  const nameOn = (page: PDFPage, glyph: Glyph) => {
    let pageNames = names.get(page);
    if (!pageNames) names.set(page, (pageNames = new Map()));
    let name = pageNames.get(glyph.id);
    if (!name) {
      let form = forms.get(glyph.id);
      if (!form) {
        form = doc.context.register(
          doc.context.formXObject(glyphOperators(glyph), {
            BBox: [minX, minY, maxX, maxY],
          }),
        );
        forms.set(glyph.id, form);
      }
      name = page.node.newXObject("Glyph", form);
      pageNames.set(glyph.id, name);
    }
    return name;
  };
  return {
    metrics,
    width: (text, size) =>
      (glyphs(text).reduce((sum, glyph) => sum + glyph.advanceWidth, 0) *
        size) /
      metrics.unitsPerEm,
    draw: (page, text, x, y, size, color) => {
      const scale = size / metrics.unitsPerEm;
      let advance = 0;
      page.pushOperators(pushGraphicsState(), setFillingColor(color));
      for (const glyph of glyphs(text)) {
        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(scale, 0, 0, scale, x + advance, y),
          drawObject(nameOn(page, glyph)),
          popGraphicsState(),
        );
        advance += glyph.advanceWidth * scale;
      }
      page.pushOperators(popGraphicsState());
    },
  };
};

export type SigningFonts = {
  sans: TextFont;
  bold: TextFont;
  script: (id: SignatureFontId | undefined) => Promise<TextFont>;
  /** Loads the fallback fonts that `texts` need, so `pick` can stay synchronous. */
  prepare: (texts: string[]) => Promise<void>;
  /** The first of `preferred`, the sans and the prepared fallbacks that has every glyph, else the closest. */
  pick: (text: string, preferred?: EmbeddedFont) => EmbeddedFont;
};

export const embedSigningFonts = async (
  doc: PDFDocument,
): Promise<SigningFonts> => {
  doc.registerFontkit(fontkit);
  const embedded = new Map<string, Promise<TextFont>>();
  const embed = (file: string) => {
    let cached = embedded.get(file);
    if (!cached) {
      cached = loadFontFile(file).then(async ({ bytes, metrics }) =>
        textFont(
          await doc.embedFont(bytes, {
            subset: true,
            features: LAYOUT_FEATURES,
          }),
          metrics,
        ),
      );
      embedded.set(file, cached);
    }
    return cached;
  };
  // The hinted Noto Sans build: the unhinted one has odd-length glyphs, which fontkit's subsetter misaligns.
  const [sans, bold] = await Promise.all([
    embed("NotoSans-Regular.ttf"),
    embed("NotoSans-Bold.ttf"),
  ]);
  const script = (id: SignatureFontId | undefined) =>
    embed(
      (SIGNATURE_FONTS.find((f) => f.id === id) ?? SIGNATURE_FONTS[0]).ttfFile,
    );

  /** Indexed like FALLBACK_FONTS, with holes for fonts no text has needed. */
  const fallbacks: (EmbeddedFont | undefined)[] = [];
  const warned = new Set<string>();

  const prepare = async (texts: string[]) => {
    const needed = FALLBACK_FONTS.map((font, index) => ({ ...font, index }))
      .filter(({ scripts }) => texts.some((text) => scripts.test(text)))
      .filter(({ index }) => !fallbacks[index]);
    const files = await Promise.all(needed.map((f) => loadFontFile(f.file)));
    await Promise.all(
      needed.map(async ({ file, index, outlines }, i) => {
        fallbacks[index] ??= outlines
          ? outlineFont(doc, files[i].metrics)
          : await embed(file);
      }),
    );

    const fonts = [sans, ...fallbacks].filter((f): f is EmbeddedFont => !!f);
    const missing = [...new Set(texts.join(""))].filter(
      (ch) => !warned.has(ch) && !fonts.some((f) => hasGlyph(f.metrics, ch)),
    );
    missing.forEach((ch) => warned.add(ch));
    if (missing.length) {
      const codes = missing.map(
        (ch) =>
          `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
      );
      console.warn(
        `BrockCSC Sign: no bundled font has ${codes.join(", ")}, so it prints as an empty box.`,
      );
    }
  };

  const pick = (text: string, preferred?: EmbeddedFont) => {
    const fonts = [preferred, sans, ...fallbacks].filter(
      (f): f is EmbeddedFont => !!f,
    );
    return fonts[
      closestFont(
        text,
        fonts.map((f) => f.metrics),
      )
    ];
  };

  return { sans, bold, script, prepare, pick };
};

export const singleLine = (text: string) =>
  text.replace(/[\p{Cc}\p{Z}]+/gu, " ").trim();

type Piece<R> = {
  text: string;
  font: EmbeddedFont;
  run: R;
  /** A space goes before this piece when it follows another on the line. */
  space: boolean;
  width: number;
};

/**
 * `text` split into pieces that each have one font: all of it in the first font that covers it, so a typed
 * name keeps one style and a right-to-left sentence stays one run; failing that word by word, and within a
 * word that no font covers, character by character.
 */
const textPieces = <R>(
  fonts: SigningFonts,
  text: string,
  run: R,
  preferred?: EmbeddedFont,
): Piece<R>[] => {
  const piece = (text: string, font: EmbeddedFont, space: boolean) => ({
    text,
    font,
    run,
    space,
    width: 0,
  });
  const whole = fonts.pick(text, preferred);
  const words = text.split(" ").filter(Boolean);
  if (covers(whole.metrics, text))
    return words.map((word, i) => piece(word, whole, i > 0));
  return words.flatMap((word, i) => {
    const font = fonts.pick(word, preferred);
    if (covers(font.metrics, word)) return [piece(word, font, i > 0)];
    const pieces: Piece<R>[] = [];
    for (const ch of word) {
      const last = pieces.at(-1);
      const chFont =
        last && ATTACHED.test(ch) ? last.font : fonts.pick(ch, preferred);
      if (last?.font === chFont) last.text += ch;
      else pieces.push(piece(ch, chFont, i > 0 && !last));
    }
    return pieces;
  });
};

export type TextLine<R> = { pieces: Piece<R>[]; width: number };

/** Neighbouring pieces in the same run and font become one, which fontkit lays out right to left when it should. */
const joinPieces = <R>(
  fonts: SigningFonts,
  pieces: Piece<R>[],
  size: number,
): TextLine<R> => {
  const joined: Piece<R>[] = [];
  for (const piece of pieces) {
    const last = joined.at(-1);
    if (last && last.font === piece.font && last.run === piece.run)
      last.text += (piece.space ? " " : "") + piece.text;
    else joined.push({ ...piece, space: !!last && piece.space });
  }
  const space = fonts.sans.width(" ", size);
  let width = 0;
  for (const piece of joined) {
    piece.width = piece.font.width(piece.text, size);
    width += piece.width + (piece.space ? space : 0);
  }
  return { pieces: joined, width };
};

const capHeight = (font: EmbeddedFont) =>
  (font.metrics.capHeight || font.metrics.unitsPerEm * 0.7) /
  font.metrics.unitsPerEm;

/** Ink extent of `line` at size 1, measured the way pdf-lib advances glyphs (no GPOS), and where each piece starts. */
const inkBox = <R>(line: TextLine<R>, space: number) => {
  let x = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const starts: number[] = [];
  for (const piece of line.pieces) {
    if (piece.space) x += space;
    starts.push(x);
    const { metrics } = piece.font;
    const scale = 1 / metrics.unitsPerEm;
    for (const glyph of metrics.layout(piece.text, LAYOUT_FEATURES).glyphs) {
      const box = glyph.bbox;
      if (Number.isFinite(box.minX) && box.maxX > box.minX) {
        minX = Math.min(minX, x + box.minX * scale);
        maxX = Math.max(maxX, x + box.maxX * scale);
        minY = Math.min(minY, box.minY * scale);
        maxY = Math.max(maxY, box.maxY * scale);
      }
      x += glyph.advanceWidth * scale;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY, starts };
};

type Rect = { x: number; y: number; width: number; height: number };

/** Draws `line` so its ink is centred in `rect`, at the largest size up to `maxSize` that fits. */
const drawInkFitted = <R>(
  page: PDFPage,
  sans: EmbeddedFont,
  line: TextLine<R>,
  rect: Rect,
  maxSize: number,
  color: RGB,
) => {
  const ink = inkBox(line, sans.width(" ", 1));
  if (!ink) return;
  const inkWidth = ink.maxX - ink.minX;
  const inkHeight = ink.maxY - ink.minY;
  const size = Math.min(
    maxSize,
    rect.width / inkWidth,
    rect.height / inkHeight,
  );
  const x = rect.x + (rect.width - inkWidth * size) / 2 - ink.minX * size;
  const y = rect.y + (rect.height - inkHeight * size) / 2 - ink.minY * size;
  line.pieces.forEach((piece, i) => {
    piece.font.draw(page, piece.text, x + ink.starts[i] * size, y, size, color);
  });
};

/** Greedy word wrap in one font; words longer than the line are broken by character. */
export const wrapText = (
  font: EmbeddedFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] => {
  const width = (value: string) => font.width(value, size);
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

type StyledRun = { text: string; bold?: boolean };

/** Greedy wrap across styled runs, each piece in a font that has its glyphs; a word wider than the line is broken by character. */
export const wrapRuns = <R extends StyledRun>(
  fonts: SigningFonts,
  runs: R[],
  size: number,
  maxWidth: number,
): TextLine<R>[] => {
  const space = fonts.sans.width(" ", size);
  const lines: Piece<R>[][] = [];
  let line: Piece<R>[] = [];
  let lineWidth = 0;
  for (const run of runs) {
    const preferred = run.bold ? fonts.bold : undefined;
    const pieces = textPieces(fonts, singleLine(run.text), run, preferred);
    if (pieces.length) pieces[0].space = true;
    for (const piece of pieces) {
      wrapText(piece.font, piece.text, size, maxWidth).forEach((text, i) => {
        const width = piece.font.width(text, size);
        const gap = i === 0 && piece.space ? space : 0;
        if (line.length && (i > 0 || lineWidth + gap + width > maxWidth)) {
          lines.push(line);
          line = [];
          lineWidth = 0;
        }
        const spaced = line.length > 0 && gap > 0;
        line.push({ ...piece, text, space: spaced });
        lineWidth += (spaced ? gap : 0) + width;
      });
    }
  }
  if (line.length) lines.push(line);
  return lines.map((pieces) => joinPieces(fonts, pieces, size));
};

/** Draws a wrapped line from `x` along `baseline`. */
export const drawTextLine = <R>(
  page: PDFPage,
  fonts: SigningFonts,
  line: TextLine<R>,
  x: number,
  baseline: number,
  size: number,
  color: (run: R) => RGB,
) => {
  const space = fonts.sans.width(" ", size);
  for (const piece of line.pieces) {
    if (piece.space) x += space;
    piece.font.draw(page, piece.text, x, baseline, size, color(piece.run));
    x += piece.width;
  }
};

/** Single line, centred horizontally on cx and vertically on the sans cap height around cy. */
export const drawCenteredLine = <R>(
  page: PDFPage,
  fonts: SigningFonts,
  line: TextLine<R>,
  cx: number,
  cy: number,
  size: number,
  color: RGB,
) =>
  drawTextLine(
    page,
    fonts,
    line,
    cx - line.width / 2,
    cy - (capHeight(fonts.sans) * size) / 2,
    size,
    () => color,
  );

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
  { kind: "typed"; line: TextLine<null> } | { kind: "image"; image: PDFImage };

/** Typed signature or initials in the signer's script font, with a fallback font wherever it lacks glyphs. */
export const typedMark = async (
  fonts: SigningFonts,
  text: string,
  id: SignatureFontId | undefined,
): Promise<MarkContent> => {
  const [script] = await Promise.all([fonts.script(id), fonts.prepare([text])]);
  const pieces = textPieces(fonts, text, null, script);
  return { kind: "typed", line: joinPieces(fonts, pieces, 1) };
};

const MARK_LABEL_SIZE = 5.5;

/** The framed signature or initials: bracket, "Signed by:" on the top arm, the short id on the bottom arm. */
export const drawSignatureMark = (
  page: PDFPage,
  sans: TextFont,
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
    drawInkFitted(page, sans, content.line, band, 26, INK);
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
