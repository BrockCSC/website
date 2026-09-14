import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  BRAND_ACCENT_COLOR,
  BRAND_COLOR,
  CLUB_MAILING_ADDRESS,
  CLUB_NAME,
} from "@/lib/brand";
import type { DocumentTemplate, TemplateLine, TemplateRun } from "./templates";

const hexDigits = (hex: string) => hex.replace(/^#/, "").toUpperCase();

const hexToRgb = (hex: string) => {
  const clean = hexDigits(hex);
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
};

const readLogoBytes = () =>
  readFile(join(process.cwd(), "public/email-logo.png"));

const ORDERED_LIST_REFERENCE = "template-ordered-list";

/**
 * Renders each template's placeholder content (headings, paragraphs and
 * lists — see lib/documents/templates.ts) into a branded .docx or .pdf,
 * generated fresh on every request from lib/brand.ts's constants. Nothing
 * here is stored: this is a blank form handed to whoever asked for it, not a
 * club record, so there's no document_version and no approval gate.
 */
export const generateTemplateDocx = async (
  template: DocumentTemplate,
): Promise<Buffer> => {
  const logoBytes = await readLogoBytes();
  const brandHex = hexDigits(BRAND_COLOR);
  const accentHex = hexDigits(BRAND_ACCENT_COLOR);
  const noBorder = {
    style: BorderStyle.NONE,
    size: 0,
    color: "FFFFFF",
  } as const;

  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: noBorder,
          bottom: { style: BorderStyle.SINGLE, size: 24, color: brandHex },
          left: noBorder,
          right: noBorder,
          insideHorizontal: noBorder,
          insideVertical: noBorder,
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: logoBytes,
                        transformation: { width: 48, height: 48 },
                        type: "png",
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                borders: {
                  top: noBorder,
                  bottom: noBorder,
                  right: noBorder,
                  left: {
                    style: BorderStyle.SINGLE,
                    size: 18,
                    color: accentHex,
                  },
                },
                margins: { left: 200 },
                width: { size: 88, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: CLUB_NAME,
                        bold: true,
                        color: brandHex,
                        size: 24,
                      }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: CLUB_MAILING_ADDRESS,
                        color: "6B7280",
                        size: 18,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "" }),
    ],
  });

  const lineRuns = (line: TemplateLine) =>
    line.map((run) => new TextRun({ text: run.text, bold: run.bold }));

  const paragraphChildren = (lines: TemplateLine[]) =>
    lines.flatMap((line, index) => [
      ...(index > 0 ? [new TextRun({ break: 1 })] : []),
      ...lineRuns(line),
    ]);

  const children = template.body.flatMap((block) => {
    if (block.kind === "heading") {
      return [
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: block.text,
              bold: true,
              color: brandHex,
              size: 26,
            }),
          ],
        }),
      ];
    }
    if (block.kind === "list") {
      return block.items.map(
        (item) =>
          new Paragraph({
            ...(block.ordered
              ? { numbering: { reference: ORDERED_LIST_REFERENCE, level: 0 } }
              : { bullet: { level: 0 } }),
            spacing: { after: 60 },
            children: lineRuns(item),
          }),
      );
    }
    return [
      new Paragraph({
        spacing: { after: 160 },
        children: paragraphChildren(block.lines),
      }),
    ];
  });

  const doc = new DocxDocument({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, bottom: 1440, left: 1350, right: 1350 },
          },
        },
        headers: { default: header },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const BODY_SIZE = 11;
const LEADING = 15;

type PdfCursor = {
  doc: PDFDocument;
  logo: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  font: PDFFont;
  bold: PDFFont;
  brand: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  page: PDFPage;
  y: number;
};

const drawPdfHeader = (
  cursor: Omit<PdfCursor, "page" | "y">,
  page: PDFPage,
) => {
  const logoSize = 40;
  const top = PAGE_HEIGHT - MARGIN;
  const dividerX = MARGIN + logoSize + 10;
  const textX = dividerX + 12;
  page.drawImage(cursor.logo, {
    x: MARGIN,
    y: top - logoSize,
    width: logoSize,
    height: logoSize,
  });
  page.drawLine({
    start: { x: dividerX, y: top },
    end: { x: dividerX, y: top - logoSize },
    thickness: 2,
    color: cursor.accent,
  });
  page.drawText(CLUB_NAME, {
    x: textX,
    y: top - 14,
    size: 12,
    font: cursor.bold,
    color: cursor.brand,
  });
  page.drawText(CLUB_MAILING_ADDRESS, {
    x: textX,
    y: top - 28,
    size: 8,
    font: cursor.font,
    color: rgb(0x6b / 255, 0x72 / 255, 0x80 / 255),
  });
  const ruleY = top - logoSize - 8;
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN, y: ruleY },
    thickness: 2,
    color: cursor.brand,
  });
  return ruleY - 24;
};

const newPdfPage = (cursor: PdfCursor) => {
  cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cursor.y = drawPdfHeader(cursor, cursor.page);
};

const ensurePdfSpace = (cursor: PdfCursor, needed: number) => {
  if (cursor.y - needed < MARGIN) newPdfPage(cursor);
};

/** Greedy word wrap; each returned line is the runs (with their own bold flag) that make it up. */
const wrapRuns = (
  cursor: PdfCursor,
  runs: TemplateRun[],
  maxWidth: number,
): TemplateRun[][] => {
  const words = runs.flatMap((run) =>
    run.text
      .split(" ")
      .filter(Boolean)
      .map((text) => ({ text, bold: run.bold })),
  );
  const spaceWidth = cursor.font.widthOfTextAtSize(" ", BODY_SIZE);
  const lines: TemplateRun[][] = [];
  let current: TemplateRun[] = [];
  let width = 0;
  for (const word of words) {
    const font = word.bold ? cursor.bold : cursor.font;
    const wordWidth = font.widthOfTextAtSize(word.text, BODY_SIZE);
    const extra = current.length ? spaceWidth : 0;
    if (current.length && width + extra + wordWidth > maxWidth) {
      lines.push(current);
      current = [word];
      width = wordWidth;
    } else {
      current.push(word);
      width += extra + wordWidth;
    }
  }
  if (current.length) lines.push(current);
  return lines;
};

const drawWrappedLine = (
  cursor: PdfCursor,
  tokens: TemplateRun[],
  x: number,
) => {
  const spaceWidth = cursor.font.widthOfTextAtSize(" ", BODY_SIZE);
  let cursorX = x;
  for (const token of tokens) {
    const font = token.bold ? cursor.bold : cursor.font;
    cursor.page.drawText(token.text, {
      x: cursorX,
      y: cursor.y,
      size: BODY_SIZE,
      font,
      color: rgb(0x19 / 255, 0x16 / 255, 0x19 / 255),
    });
    cursorX += font.widthOfTextAtSize(token.text, BODY_SIZE) + spaceWidth;
  }
};

const drawParagraph = (
  cursor: PdfCursor,
  lines: TemplateLine[],
  x = MARGIN,
) => {
  const maxWidth = PAGE_WIDTH - MARGIN - x;
  for (const line of lines) {
    for (const wrapped of wrapRuns(cursor, line, maxWidth)) {
      ensurePdfSpace(cursor, LEADING);
      drawWrappedLine(cursor, wrapped, x);
      cursor.y -= LEADING;
    }
  }
};

const drawHeading = (cursor: PdfCursor, text: string) => {
  ensurePdfSpace(cursor, 34);
  cursor.y -= 10;
  cursor.page.drawText(text, {
    x: MARGIN,
    y: cursor.y,
    size: 14,
    font: cursor.bold,
    color: cursor.brand,
  });
  cursor.y -= 22;
};

const drawListItem = (
  cursor: PdfCursor,
  marker: string,
  line: TemplateLine,
) => {
  const markerWidth = cursor.font.widthOfTextAtSize(marker, BODY_SIZE) + 8;
  const x = MARGIN + markerWidth;
  const maxWidth = PAGE_WIDTH - MARGIN - x;
  const wrapped = wrapRuns(cursor, line, maxWidth);
  wrapped.forEach((tokens, index) => {
    ensurePdfSpace(cursor, LEADING);
    if (index === 0) {
      cursor.page.drawText(marker, {
        x: MARGIN,
        y: cursor.y,
        size: BODY_SIZE,
        font: cursor.font,
        color: rgb(0x19 / 255, 0x16 / 255, 0x19 / 255),
      });
    }
    drawWrappedLine(cursor, tokens, x);
    cursor.y -= LEADING;
  });
};

export const generateTemplatePdf = async (
  template: DocumentTemplate,
): Promise<Uint8Array> => {
  const [logoBytes, doc] = await Promise.all([
    readLogoBytes(),
    PDFDocument.create(),
  ]);
  const [logo, font, bold] = await Promise.all([
    doc.embedPng(logoBytes),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  const cursor: PdfCursor = {
    doc,
    logo,
    font,
    bold,
    brand: hexToRgb(BRAND_COLOR),
    accent: hexToRgb(BRAND_ACCENT_COLOR),
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: 0,
  };
  cursor.y = drawPdfHeader(cursor, cursor.page);

  for (const block of template.body) {
    if (block.kind === "heading") {
      drawHeading(cursor, block.text);
    } else if (block.kind === "list") {
      block.items.forEach((item, index) => {
        drawListItem(cursor, block.ordered ? `${index + 1}.` : "•", item);
      });
      cursor.y -= 6;
    } else {
      drawParagraph(cursor, block.lines);
      cursor.y -= 6;
    }
  }

  return doc.save();
};
