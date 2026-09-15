import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { BRAND_COLOR, CLUB_NAME } from "@/lib/brand";
import {
  PDF_LETTER_HEIGHT,
  PDF_LETTER_MARGIN,
  PDF_LETTER_WIDTH,
  drawLetterhead,
  hexToRgb,
  readLogoBytes,
} from "@/lib/documents/letterhead";
import {
  MUTED,
  type SigningFonts,
  type TextLine,
  drawTextLine,
  embedSigningFonts,
  singleLine,
  wrapRuns,
} from "@/lib/documents/signature-marks";
import { generatedStamp } from "./dates";
import type {
  ReportBlock,
  ReportCell,
  ReportDocument,
  ReportRun,
  ReportSigner,
  ReportText,
} from "./types";

const LEFT = PDF_LETTER_MARGIN;
const RIGHT = PDF_LETTER_WIDTH - PDF_LETTER_MARGIN;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 62;

const BRAND = hexToRgb(BRAND_COLOR);
const TEXT = hexToRgb("#1f2328");
const BAR = hexToRgb("#f4ebea");
const RULE = hexToRgb("#e2e4e8");

const leading = (size: number) => size * 1.38;

const TABLE_SIZE = 9;
const TABLE_LINE = 12.4;
const TABLE_PAD = 5;
const TABLE_HEADER = 24;
const FIELD_LABEL_WIDTH = 110;
const SIGNER_WIDTH = 230;
const SIGNER_GAP = 40;
const SIGNER_ROW = 78;

type Line = TextLine<ReportRun>;
type Layout = {
  doc: PDFDocument;
  fonts: SigningFonts;
  letterhead: { logo: PDFImage; font: PDFFont; bold: PDFFont };
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  /** Where content starts under the letterhead. */
  top: number;
  /** Redraws the open table's header row after a page break. */
  tableHeader: (() => void) | null;
};

const runsOf = (text: ReportText): ReportRun[] =>
  typeof text === "string" ? [{ text }] : text;

const entriesOf = (cell: ReportCell): ReportText[] =>
  typeof cell === "object" && "lines" in cell ? cell.lines : [cell];

const plain = (text: ReportText) =>
  runsOf(text)
    .map((run) => run.text)
    .join(" ");

const addPage = (layout: Layout) => {
  const page = layout.doc.addPage([PDF_LETTER_WIDTH, PDF_LETTER_HEIGHT]);
  layout.pages.push(page);
  layout.page = page;
  layout.y = drawLetterhead(page, layout.letterhead);
  layout.tableHeader?.();
};

const ensureSpace = (layout: Layout, height: number) => {
  if (layout.y - height < BOTTOM) addPage(layout);
};

const drawLine = (
  layout: Layout,
  line: Line,
  x: number,
  baseline: number,
  size: number,
) =>
  drawTextLine(layout.page, layout.fonts, line, x, baseline, size, (run) =>
    run.muted ? MUTED : TEXT,
  );

const rule = (layout: Layout, y: number) =>
  layout.page.drawLine({
    start: { x: LEFT, y },
    end: { x: RIGHT, y },
    thickness: 0.5,
    color: RULE,
  });

/** Wrapped lines one after another, breaking pages between lines. */
const drawFlow = (
  layout: Layout,
  runs: ReportRun[],
  size: number,
  after: number,
) => {
  for (const line of wrapRuns(layout.fonts, runs, size, WIDTH)) {
    ensureSpace(layout, leading(size));
    drawLine(layout, line, LEFT, layout.y - size, size);
    layout.y -= leading(size);
  }
  layout.y -= after;
};

/** The largest size from `max` down to `min` that keeps `runs` on one line within `width`, else wrapped at `min`. */
const fitRuns = (
  fonts: SigningFonts,
  runs: ReportRun[],
  max: number,
  min: number,
  width: number,
) => {
  for (let size = max; size >= min; size -= 0.5) {
    const lines = wrapRuns(fonts, runs, size, Infinity);
    if ((lines[0]?.width ?? 0) <= width) return { size, lines };
  }
  return { size: min, lines: wrapRuns(fonts, runs, min, width) };
};

const drawTitle = (
  layout: Layout,
  report: ReportDocument,
  generated: string | null,
  confidential: boolean,
) => {
  const { fonts } = layout;
  const badge = "CONFIDENTIAL";
  const badgeSize = 7.5;
  const badgeWidth = confidential ? fonts.bold.width(badge, badgeSize) : 0;
  const size = 18;
  const lines = wrapRuns(
    fonts,
    [{ text: report.title, bold: true }],
    size,
    confidential ? WIDTH - badgeWidth - 12 : WIDTH,
  );
  lines.forEach((line, i) => {
    const baseline = layout.y - size;
    drawLine(layout, line, LEFT, baseline, size);
    if (i === 0 && confidential) {
      layout.page.drawText(badge, {
        x: RIGHT - badgeWidth,
        y: baseline,
        size: badgeSize,
        font: fonts.bold.pdf,
        color: BRAND,
      });
    }
    layout.y -= leading(size);
  });
  if (report.subtitle) {
    drawFlow(layout, [{ text: report.subtitle, muted: true }], 10.5, 0);
  }
  if (generated) drawFlow(layout, [{ text: generated, muted: true }], 8, 0);
  layout.y -= 16;
};

const drawFields = (
  layout: Layout,
  items: { label: string; value: ReportText }[],
) => {
  const { fonts } = layout;
  const labelSize = 9;
  const valueSize = 9.5;
  for (const item of items) {
    const labels = wrapRuns(
      fonts,
      [{ text: item.label, muted: true }],
      labelSize,
      FIELD_LABEL_WIDTH - 8,
    );
    const values = wrapRuns(
      fonts,
      runsOf(item.value),
      valueSize,
      WIDTH - FIELD_LABEL_WIDTH,
    );
    const height = Math.max(
      labels.length * leading(labelSize),
      values.length * leading(valueSize),
    );
    ensureSpace(layout, height);
    // Both columns share the value's first baseline so a label sits level with its value.
    const baseline = layout.y - valueSize;
    labels.forEach((line, i) =>
      drawLine(
        layout,
        line,
        LEFT,
        baseline - i * leading(labelSize),
        labelSize,
      ),
    );
    values.forEach((line, i) =>
      drawLine(
        layout,
        line,
        LEFT + FIELD_LABEL_WIDTH,
        baseline - i * leading(valueSize),
        valueSize,
      ),
    );
    layout.y -= height + 3;
  }
  layout.y -= 7;
};

const drawBlank = (layout: Layout, label: string) => {
  const size = 9.5;
  const height = 30;
  ensureSpace(layout, height);
  const baseline = layout.y - 18;
  const [line] = wrapRuns(
    layout.fonts,
    [{ text: label, bold: true }],
    size,
    Infinity,
  );
  if (line) drawLine(layout, line, LEFT, baseline, size);
  layout.page.drawLine({
    start: { x: LEFT + (line?.width ?? 0) + 8, y: baseline - 2 },
    end: { x: RIGHT, y: baseline - 2 },
    thickness: 0.75,
    color: MUTED,
  });
  layout.y -= height;
};

const drawSignatures = (
  layout: Layout,
  label: string,
  signers: ReportSigner[],
) => {
  const { fonts } = layout;
  const labelSize = 9.5;
  const labelLines = wrapRuns(
    fonts,
    [{ text: label, bold: true }],
    labelSize,
    WIDTH,
  );
  const labelHeight = labelLines.length * leading(labelSize) + 10;

  const placed = signers.map((signer) => {
    const name = signer.name
      ? fitRuns(
          fonts,
          [{ text: signer.name, bold: true }],
          9.5,
          7,
          SIGNER_WIDTH,
        )
      : null;
    const title = signer.title
      ? fitRuns(
          fonts,
          [{ text: signer.title, muted: true }],
          8,
          6.5,
          SIGNER_WIDTH,
        )
      : null;
    const extra =
      (name ? (name.lines.length - 1) * leading(name.size) : 0) +
      (title ? (title.lines.length - 1) * leading(title.size) : 0);
    return { name, title, extra };
  });
  const rows: (typeof placed)[] = [];
  for (let i = 0; i < placed.length; i += 2) rows.push(placed.slice(i, i + 2));
  const heightOf = (row: typeof placed) =>
    SIGNER_ROW + Math.max(0, ...row.map((s) => s.extra));

  const line = (x1: number, x2: number, y: number) =>
    layout.page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness: 0.75,
      color: MUTED,
    });
  const caption = (text: string, x: number, baseline: number) =>
    layout.page.drawText(text, {
      x,
      y: baseline,
      size: 7.5,
      font: fonts.sans.pdf,
      color: MUTED,
    });

  ensureSpace(layout, labelHeight + (rows[0] ? heightOf(rows[0]) : 0));
  labelLines.forEach((text, n) =>
    drawLine(
      layout,
      text,
      LEFT,
      layout.y - labelSize - n * leading(labelSize),
      labelSize,
    ),
  );
  layout.y -= labelHeight;

  for (const row of rows) {
    const height = heightOf(row);
    ensureSpace(layout, height);
    const top = layout.y;
    row.forEach(({ name, title }, column) => {
      const x = LEFT + column * (SIGNER_WIDTH + SIGNER_GAP);
      line(x, x + 150, top - 34);
      line(x + 164, x + SIGNER_WIDTH, top - 34);
      caption("Signature", x, top - 44);
      caption("Date", x + 164, top - 44);
      let baseline = top - 58;
      if (name) {
        name.lines.forEach((text, n) => {
          if (n > 0) baseline -= leading(name.size);
          drawLine(layout, text, x, baseline, name.size);
        });
      } else {
        caption("Printed name", x, baseline);
        line(x + 62, x + SIGNER_WIDTH, baseline);
      }
      baseline -= 12;
      title?.lines.forEach((text, n) => {
        if (n > 0) baseline -= leading(title.size);
        drawLine(layout, text, x, baseline, title.size);
      });
    });
    layout.y -= height;
  }
  layout.y -= 12;
};

type Slot = { line: Line; size: number } | null;

const drawTable = (
  layout: Layout,
  block: Extract<ReportBlock, { kind: "table" }>,
) => {
  const { fonts } = layout;
  const total = block.columns.reduce((sum, c) => sum + c.width, 0) || 1;
  let nextX = LEFT;
  const columns = block.columns.map((column) => {
    const width = (column.width / total) * WIDTH;
    const x = nextX;
    nextX += width;
    return { ...column, x, width, inner: width - 2 * TABLE_PAD };
  });
  const lineX = (column: (typeof columns)[number], line: Line) =>
    column.align === "right"
      ? column.x + column.width - TABLE_PAD - line.width
      : column.x + TABLE_PAD;
  const heightOf = (lines: number) => lines * TABLE_LINE + 2 * TABLE_PAD;

  const header = () => {
    const top = layout.y;
    layout.page.drawRectangle({
      x: LEFT,
      y: top - 18,
      width: WIDTH,
      height: 18,
      color: BAR,
    });
    layout.page.drawLine({
      start: { x: LEFT, y: top - 18 },
      end: { x: RIGHT, y: top - 18 },
      thickness: 0.8,
      color: BRAND,
    });
    for (const column of columns) {
      const { size, lines } = fitRuns(
        fonts,
        [{ text: column.title, bold: true }],
        8.5,
        6.5,
        column.inner,
      );
      if (lines[0]) {
        drawLine(layout, lines[0], lineX(column, lines[0]), top - 12, size);
      }
    }
    layout.y = top - TABLE_HEADER;
  };

  // One slot per printed line; a blank entry still takes its line so the entries below it stay put.
  const measure = (cells: ReportCell[]) =>
    columns.map((column, i): Slot[] =>
      entriesOf(cells[i] ?? "").flatMap((entry): Slot[] => {
        const runs = runsOf(entry);
        const { size, lines } = column.nowrap
          ? fitRuns(fonts, runs, TABLE_SIZE, 7, column.inner)
          : {
              size: TABLE_SIZE,
              lines: wrapRuns(fonts, runs, TABLE_SIZE, column.inner),
            };
        return lines.length ? lines.map((line) => ({ line, size })) : [null];
      }),
    );

  const drawPiece = (slots: Slot[][], from: number, to: number) => {
    const top = layout.y;
    slots.forEach((cell, i) => {
      for (let n = from; n < Math.min(to, cell.length); n++) {
        const slot = cell[n];
        if (!slot) continue;
        // Every size shares the 9pt baseline grid, so a shrunk ID lines up with its row.
        const baseline = top - TABLE_PAD - (n - from) * TABLE_LINE - TABLE_SIZE;
        drawLine(
          layout,
          slot.line,
          lineX(columns[i], slot.line),
          baseline,
          slot.size,
        );
      }
    });
    layout.y = top - heightOf(to - from);
  };

  const pageRoom = layout.top - TABLE_HEADER - BOTTOM;

  const drawRow = (slots: Slot[][]) => {
    const count = Math.max(1, ...slots.map((cell) => cell.length));
    const room = () => layout.y - BOTTOM;
    if (heightOf(count) > room()) {
      if (heightOf(count) <= pageRoom) {
        addPage(layout);
      } else {
        // Taller than a page: split between lines, every cell advancing together.
        let from = 0;
        while (count - from > 0) {
          let fit = Math.floor((room() - 2 * TABLE_PAD) / TABLE_LINE);
          if (fit < 3) {
            addPage(layout);
            fit = Math.floor((room() - 2 * TABLE_PAD) / TABLE_LINE);
          }
          const to = Math.min(count, from + fit);
          drawPiece(slots, from, to);
          from = to;
          if (from < count) addPage(layout);
        }
        rule(layout, layout.y);
        return;
      }
    }
    drawPiece(slots, 0, count);
    rule(layout, layout.y);
  };

  const rows = block.rows.map(measure);
  const emptyLines = rows.length
    ? []
    : wrapRuns(
        fonts,
        [{ text: block.empty, muted: true }],
        TABLE_SIZE,
        WIDTH - 2 * TABLE_PAD,
      );
  const firstRow = rows[0]
    ? heightOf(Math.max(1, ...rows[0].map((cell) => cell.length)))
    : heightOf(Math.max(1, emptyLines.length));

  layout.tableHeader = null;
  // Never leave the header alone: keep the first row with it, or the three lines a split row starts with.
  const keep = firstRow <= pageRoom ? firstRow : heightOf(3);
  ensureSpace(layout, Math.min(TABLE_HEADER + keep + 12, layout.top - BOTTOM));
  layout.tableHeader = header;
  header();

  for (const row of rows) drawRow(row);
  if (!rows.length) {
    const top = layout.y;
    emptyLines.forEach((line, n) =>
      drawLine(
        layout,
        line,
        LEFT + TABLE_PAD,
        top - TABLE_PAD - n * TABLE_LINE - TABLE_SIZE,
        TABLE_SIZE,
      ),
    );
    layout.y = top - firstRow;
    rule(layout, layout.y);
  }

  layout.tableHeader = null;
  layout.y -= 12;
};

const blockStrings = (block: ReportBlock): string[] => {
  switch (block.kind) {
    case "paragraph":
      return [plain(block.text)];
    case "note":
      return [block.text];
    case "blank":
      return [block.label];
    case "fields":
      return block.items.flatMap((item) => [item.label, plain(item.value)]);
    case "table":
      return [
        block.empty,
        ...block.columns.map((column) => column.title),
        ...block.rows.flatMap((row) =>
          row.flatMap((cell) => entriesOf(cell).map(plain)),
        ),
      ];
    case "signatures":
      return [
        block.label,
        ...block.signers.flatMap((s) => [s.name ?? "", s.title ?? ""]),
      ];
  }
};

/** A report or letter on club letterhead. Data text is drawn in Noto, so any name prints. */
export const renderReportPdf = async (
  report: ReportDocument,
  options: { generatedAt: Date; generatedBy: string; confidential: boolean },
): Promise<Uint8Array> => {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [fonts, logoBytes] = await Promise.all([
    embedSigningFonts(doc),
    readLogoBytes(),
  ]);
  // Helvetica only draws the ASCII letterhead; standard fonts embed no font file.
  const [logo, font, bold] = await Promise.all([
    doc.embedPng(logoBytes),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  const generated =
    report.kind === "report"
      ? `Generated ${generatedStamp(options.generatedAt)} by ${options.generatedBy}`
      : null;
  const footer = options.confidential
    ? `Confidential — contains personal information · ${report.title}`
    : `${CLUB_NAME} · ${report.title}`;
  await fonts.prepare([
    report.title,
    report.subtitle ?? "",
    generated ?? "",
    footer,
    "CONFIDENTIAL",
    ...report.blocks.flatMap(blockStrings),
  ]);

  const letterhead = { logo, font, bold };
  const first = doc.addPage([PDF_LETTER_WIDTH, PDF_LETTER_HEIGHT]);
  const top = drawLetterhead(first, letterhead);
  const layout: Layout = {
    doc,
    fonts,
    letterhead,
    pages: [first],
    page: first,
    y: top,
    top,
    tableHeader: null,
  };
  drawTitle(layout, report, generated, options.confidential);

  for (const block of report.blocks) {
    if (block.kind === "paragraph") {
      drawFlow(layout, runsOf(block.text), 10, 8);
    } else if (block.kind === "note") {
      drawFlow(layout, [{ text: block.text, muted: true }], 8, 8);
    } else if (block.kind === "fields") {
      drawFields(layout, block.items);
    } else if (block.kind === "blank") {
      drawBlank(layout, block.label);
    } else if (block.kind === "table") {
      drawTable(layout, block);
    } else {
      drawSignatures(layout, block.label, block.signers);
    }
  }

  const footerSize = 7.5;
  const [footerLine] = wrapRuns(
    fonts,
    [{ text: footer, muted: true }],
    footerSize,
    Infinity,
  );
  layout.pages.forEach((page, i) => {
    layout.page = page;
    rule(layout, 44);
    if (footerLine) drawLine(layout, footerLine, LEFT, 32, footerSize);
    const label = `Page ${i + 1} of ${layout.pages.length}`;
    page.drawText(label, {
      x: RIGHT - fonts.sans.width(label, footerSize),
      y: 32,
      size: footerSize,
      font: fonts.sans.pdf,
      color: MUTED,
    });
  });

  doc.setTitle(singleLine(report.title));
  doc.setSubject(CLUB_NAME);
  doc.setCreator("BrockCSC Admin");
  doc.setProducer("BrockCSC Admin");
  doc.setCreationDate(options.generatedAt);
  doc.setModificationDate(options.generatedAt);
  return doc.save();
};
