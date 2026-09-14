import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, type PDFImage, type PDFPage, rgb } from "pdf-lib";
import type { SigningEvent, SigningEventType } from "@/lib/api/types";
import { BRAND_COLOR, CLUB_NAME } from "@/lib/brand";
import { SIGNING_TIME_ZONE } from "./fields";
import { type StampSigner, markContent } from "./signed-pdf";
import {
  type EmbeddedFont,
  MUTED,
  type SigningFonts,
  drawSignatureMark,
  embedSigningFonts,
  formatSigningTimestamp,
  signatureShortId,
  singleLine,
  wrapText,
} from "./signature-marks";

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

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 42;
const RIGHT = PAGE_WIDTH - 42;
const CONTENT_WIDTH = RIGHT - LEFT;
const HEADER_RULE_Y = PAGE_HEIGHT - 74;
const BOTTOM = 58;
const BODY = 8.5;
const SMALL = 7.5;

const COLUMNS = {
  first: { x: LEFT, width: 200 },
  second: { x: 250, width: 168 },
  third: { x: 428, width: RIGHT - 428 },
  wide: { x: 250, width: RIGHT - 250 },
  lead: { x: LEFT, width: 428 - LEFT - 12 },
  full: { x: LEFT, width: CONTENT_WIDTH },
};

const hexColor = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );

const BRAND = hexColor(BRAND_COLOR);
const TEXT = hexColor("#1f2328");
const BAR = hexColor("#f4ebea");
const RULE = hexColor("#e2e4e8");

type Run = { text: string; bold?: boolean; muted?: boolean };
type Block =
  | { kind: "text"; runs: Run[]; size?: number }
  | { kind: "gap"; height: number }
  | {
      kind: "draw";
      height: number;
      draw: (page: PDFPage, x: number, top: number, width: number) => void;
    };
type Cell = { x: number; width: number; blocks: Block[] };
type Column = { x: number; title: string };

const leadingFor = (size: number) => size * 1.38;

/** Signer and envelope timestamps come from the signer record first, then the audit trail. */
const firstEvent = (
  events: SigningEvent[],
  types: SigningEventType[],
  signerId?: string,
) =>
  events
    .filter(
      (e) =>
        types.includes(e.type) &&
        (!signerId || e.signerId === signerId) &&
        !Number.isNaN(Date.parse(e.at)),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];

const latest = (values: (string | undefined)[]) =>
  values
    .filter((v): v is string => !!v && !Number.isNaN(Date.parse(v)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1);

const describeUserAgent = (ua: string) => {
  const match = (pattern: RegExp) => pattern.exec(ua)?.[1]?.split(".")[0];
  const browsers: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:CriOS|Chrome)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  const systems: [string, RegExp][] = [
    ["iOS", /iPhone|iPad|iPod/],
    ["Android", /Android/],
    ["Windows", /Windows NT/],
    ["ChromeOS", /CrOS/],
    ["macOS", /Mac OS X|Macintosh/],
    ["Linux", /Linux/],
  ];
  const browser = browsers
    .map(([name, pattern]) => {
      const version = match(pattern);
      return version ? `${name} ${version}` : null;
    })
    .find(Boolean);
  const system = systems.find(([, pattern]) => pattern.test(ua))?.[0];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? ua.slice(0, 160);
};

type Layout = {
  doc: PDFDocument;
  fonts: SigningFonts;
  logo: PDFImage;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  table: Column[] | null;
  afterLayout: ((pageCount: number) => void)[];
};

const fontOf = (layout: Layout, run: Run): EmbeddedFont =>
  run.bold ? layout.fonts.bold : layout.fonts.sans;

type Token = { text: string; run: Run };

/** Greedy wrap across styled runs; a token wider than the line is broken by character. */
const wrapRuns = (
  layout: Layout,
  runs: Run[],
  size: number,
  width: number,
): Token[][] => {
  const lines: Token[][] = [];
  let line: Token[] = [];
  let lineWidth = 0;
  const space = layout.fonts.sans.pdf.widthOfTextAtSize(" ", size);
  const measure = (token: Token) =>
    fontOf(layout, token.run).pdf.widthOfTextAtSize(token.text, size);
  for (const run of runs) {
    for (const word of singleLine(run.text).split(" ").filter(Boolean)) {
      const pieces = wrapText(fontOf(layout, run).pdf, word, size, width);
      for (const piece of pieces) {
        const token = { text: piece, run };
        const tokenWidth = measure(token);
        const extra = line.length ? space : 0;
        if (line.length && lineWidth + extra + tokenWidth > width) {
          lines.push(line);
          line = [token];
          lineWidth = tokenWidth;
        } else {
          line.push(token);
          lineWidth += extra + tokenWidth;
        }
      }
    }
  }
  if (line.length) lines.push(line);
  return lines;
};

const blockHeight = (layout: Layout, block: Block, width: number) => {
  if (block.kind === "gap" || block.kind === "draw") return block.height;
  const size = block.size ?? BODY;
  return wrapRuns(layout, block.runs, size, width).length * leadingFor(size);
};

const cellHeight = (layout: Layout, cell: Cell) =>
  cell.blocks.reduce((sum, b) => sum + blockHeight(layout, b, cell.width), 0);

const drawCell = (layout: Layout, cell: Cell, top: number) => {
  let y = top;
  for (const block of cell.blocks) {
    if (block.kind === "gap") {
      y -= block.height;
      continue;
    }
    if (block.kind === "draw") {
      block.draw(layout.page, cell.x, y, cell.width);
      y -= block.height;
      continue;
    }
    const size = block.size ?? BODY;
    const leading = leadingFor(size);
    const space = layout.fonts.sans.pdf.widthOfTextAtSize(" ", size);
    for (const line of wrapRuns(layout, block.runs, size, cell.width)) {
      const baseline = y - size;
      let x = cell.x;
      for (const token of line) {
        const font = fontOf(layout, token.run);
        layout.page.drawText(token.text, {
          x,
          y: baseline,
          size,
          font: font.pdf,
          color: token.run.muted ? MUTED : TEXT,
        });
        x += font.pdf.widthOfTextAtSize(token.text, size) + space;
      }
      y -= leading;
    }
  }
};

const drawPageHeader = (layout: Layout, page: PDFPage) => {
  const logoSize = 30;
  const top = PAGE_HEIGHT - 34;
  page.drawImage(layout.logo, {
    x: LEFT,
    y: top - logoSize,
    width: logoSize,
    height: logoSize,
  });
  page.drawText("BrockCSC Sign", {
    x: LEFT + logoSize + 9,
    y: top - 13,
    size: 13,
    font: layout.fonts.bold.pdf,
    color: BRAND,
  });
  page.drawText(CLUB_NAME, {
    x: LEFT + logoSize + 9,
    y: top - 25,
    size: SMALL,
    font: layout.fonts.sans.pdf,
    color: MUTED,
  });
  const label = "Certificate of Completion";
  if (layout.pages.length > 1) {
    const width = layout.fonts.sans.pdf.widthOfTextAtSize(label, SMALL);
    page.drawText(label, {
      x: RIGHT - width,
      y: top - 13,
      size: SMALL,
      font: layout.fonts.sans.pdf,
      color: MUTED,
    });
  }
  page.drawLine({
    start: { x: LEFT, y: HEADER_RULE_Y },
    end: { x: RIGHT, y: HEADER_RULE_Y },
    thickness: 1.5,
    color: BRAND,
  });
};

const drawTableHeader = (layout: Layout, columns: Column[]) => {
  const height = 17;
  const top = layout.y;
  layout.page.drawRectangle({
    x: LEFT,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    color: BAR,
  });
  layout.page.drawLine({
    start: { x: LEFT, y: top - height },
    end: { x: RIGHT, y: top - height },
    thickness: 0.8,
    color: BRAND,
  });
  for (const column of columns) {
    layout.page.drawText(column.title, {
      x: column.x + (column.x === LEFT ? 6 : 0),
      y: top - 11.5,
      size: BODY,
      font: layout.fonts.bold.pdf,
      color: TEXT,
    });
  }
  layout.y = top - height - 7;
};

const addPage = (layout: Layout) => {
  const page = layout.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  layout.pages.push(page);
  layout.page = page;
  drawPageHeader(layout, page);
  layout.y = HEADER_RULE_Y - 20;
  if (layout.table) drawTableHeader(layout, layout.table);
};

const ensureSpace = (layout: Layout, height: number) => {
  if (layout.y - height < BOTTOM) addPage(layout);
};

const startTable = (layout: Layout, columns: Column[], firstRow: number) => {
  layout.table = null;
  ensureSpace(layout, 17 + 7 + firstRow + 12);
  layout.y -= 6;
  layout.table = columns;
  drawTableHeader(layout, columns);
};

const endTable = (layout: Layout) => {
  layout.table = null;
  layout.y -= 10;
};

const rowHeight = (layout: Layout, cells: Cell[]) =>
  Math.max(...cells.map((c) => cellHeight(layout, c)));

const drawRow = (
  layout: Layout,
  cells: Cell[],
  { gapAfter = 8, rule = false }: { gapAfter?: number; rule?: boolean } = {},
) => {
  const height = rowHeight(layout, cells);
  ensureSpace(layout, height + gapAfter);
  const top = layout.y;
  for (const cell of cells) drawCell(layout, cell, top);
  layout.y = top - height - gapAfter;
  if (rule) {
    layout.page.drawLine({
      start: { x: LEFT, y: layout.y + gapAfter / 2 },
      end: { x: RIGHT, y: layout.y + gapAfter / 2 },
      thickness: 0.5,
      color: RULE,
    });
  }
};

const text = (runs: Run[], size?: number): Block => ({
  kind: "text",
  runs,
  size,
});
const pair = (label: string, value: string, size?: number): Block =>
  text([{ text: `${label}:`, muted: true }, { text: value || "-" }], size);
const cell = (
  column: { x: number; width: number },
  blocks: Block[],
  inset = 0,
): Cell => ({
  x: column.x + inset,
  width: column.width - inset,
  blocks,
});

/** BrockCSC-branded Certificate of Completion, laid out like an e-signature platform's completion certificate. */
export const buildCertificatePdf = async (
  input: CertificateInput,
): Promise<Uint8Array> => {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [fonts, logoBytes] = await Promise.all([
    embedSigningFonts(doc),
    readFile(join(process.cwd(), "public/email-logo.png")),
  ]);
  const logo = await doc.embedPng(logoBytes);
  const signers = [...input.signers].sort((a, b) => a.order - b.order);
  const images = new Map<Uint8Array, Promise<PDFImage>>();
  const marks = await Promise.all(
    signers.map((s) => markContent(doc, fonts, images, s, "signature")),
  );
  const stamp = (iso: string | undefined) =>
    iso ? formatSigningTimestamp(iso) : "";

  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const layout: Layout = {
    doc,
    fonts,
    logo,
    pages: [firstPage],
    page: firstPage,
    y: 0,
    table: null,
    afterLayout: [],
  };
  drawPageHeader(layout, firstPage);
  firstPage.drawText("Certificate of Completion", {
    x: LEFT,
    y: HEADER_RULE_Y - 30,
    size: 19,
    font: fonts.bold.pdf,
    color: TEXT,
  });
  layout.y = HEADER_RULE_Y - 46;

  drawRow(
    layout,
    [
      cell(COLUMNS.lead, [pair("Envelope Id", input.envelopeId)]),
      cell(COLUMNS.third, [
        text([
          { text: "Status:", muted: true },
          { text: "Completed", bold: true },
        ]),
      ]),
    ],
    { gapAfter: 2 },
  );
  drawRow(layout, [cell(COLUMNS.full, [pair("Subject", input.subject)])], {
    gapAfter: 2,
  });
  drawRow(
    layout,
    [
      cell(COLUMNS.full, [
        text([
          { text: "Source Envelope:", muted: true },
          { text: input.documentTitle },
          { text: `(${input.sourceFilename})`, muted: true },
        ]),
      ]),
    ],
    { gapAfter: 8 },
  );
  drawRow(
    layout,
    [
      cell(COLUMNS.first, [
        pair("Document Pages", String(input.sourcePageCount)),
        {
          kind: "draw",
          height: leadingFor(BODY),
          draw: (page, x, top) => {
            layout.afterLayout.push((count) =>
              drawCell(
                { ...layout, page },
                cell({ x, width: COLUMNS.first.width }, [
                  pair("Certificate Pages", String(count)),
                ]),
                top,
              ),
            );
          },
        },
        pair(
          "Signing Order",
          input.mode === "ordered" ? "Sequential" : "Parallel",
        ),
        pair("Envelope ID Stamping", "Enabled"),
        pair("Time Zone", SIGNING_TIME_ZONE),
      ]),
      cell(COLUMNS.second, [
        pair("Signatures", String(input.signatureCount)),
        pair("Initials", String(input.initialsCount)),
      ]),
      cell(COLUMNS.third, [
        text([{ text: "Envelope Originator:", muted: true }]),
        text([{ text: input.originator.name }]),
        ...(input.originator.email
          ? [text([{ text: input.originator.email }])]
          : []),
        pair("IP Address", input.originator.ip ?? "Not recorded"),
      ]),
    ],
    { gapAfter: 10 },
  );

  startTable(layout, [{ x: LEFT, title: "Record Tracking" }], 30);
  drawRow(layout, [
    cell(
      COLUMNS.first,
      [
        pair("Status", "Original"),
        text([{ text: formatSigningTimestamp(input.createdAt, true) }]),
      ],
      6,
    ),
    cell(COLUMNS.second, [
      pair("Holder", input.originator.name),
      ...(input.originator.email
        ? [text([{ text: input.originator.email }])]
        : []),
    ]),
    cell(COLUMNS.third, [pair("Location", "BrockCSC Sign")]),
  ]);
  endTable(layout);

  const signerRows = signers.map((signer, index) => {
    const signed = firstEvent(input.events, ["signed"], signer.id);
    const ip = signer.ip ?? signed?.ip;
    const userAgent = signer.userAgent ?? signed?.userAgent;
    const sentAt =
      signer.sentAt ??
      firstEvent(input.events, ["sent", "resent"], signer.id)?.at ??
      firstEvent(input.events, ["sent"])?.at ??
      input.createdAt;
    const viewedAt =
      signer.viewedAt ?? firstEvent(input.events, ["viewed"], signer.id)?.at;
    const consentedAt =
      signer.consentedAt ??
      firstEvent(input.events, ["consented"], signer.id)?.at;
    const mark = marks[index];
    const markHeight = 44;
    return [
      cell(
        COLUMNS.first,
        [
          text([{ text: signer.fullName, bold: true }]),
          text([
            signer.email
              ? { text: signer.email }
              : { text: "BrockCSC portal member", muted: true },
          ]),
          { kind: "gap", height: 4 },
          pair(
            "Security Level",
            signer.kind === "external"
              ? "Email, Account Authentication (None)"
              : "BrockCSC account login",
            SMALL,
          ),
          { kind: "gap", height: 6 },
          text(
            [
              {
                text: "Electronic Record and Signature Disclosure:",
                bold: true,
              },
            ],
            SMALL,
          ),
          consentedAt
            ? pair("Accepted", stamp(consentedAt), SMALL)
            : text([{ text: "Not recorded", muted: true }], SMALL),
          pair("Version", input.disclosureVersion, SMALL),
        ],
        6,
      ),
      cell(COLUMNS.second, [
        ...(mark
          ? [
              {
                kind: "draw" as const,
                height: markHeight + 6,
                draw: (page: PDFPage, x: number, top: number) =>
                  drawSignatureMark(
                    page,
                    fonts.sans,
                    { x, y: top - markHeight, width: 160, height: markHeight },
                    mark,
                    signatureShortId(
                      input.envelopeId,
                      signer.id,
                      signer.signedAt,
                    ),
                  ),
              },
            ]
          : []),
        pair(
          "Signature Adoption",
          signer.style === "drawn" && mark?.kind === "image"
            ? "Drawn on Device"
            : "Pre-selected Style",
          SMALL,
        ),
        pair("Using IP Address", ip ?? "Not recorded", SMALL),
        ...(userAgent
          ? [pair("Browser", describeUserAgent(userAgent), SMALL)]
          : []),
      ]),
      cell(COLUMNS.third, [
        pair("Sent", stamp(sentAt)),
        ...(viewedAt ? [pair("Viewed", stamp(viewedAt))] : []),
        pair("Signed", stamp(signer.signedAt)),
      ]),
    ];
  });

  startTable(
    layout,
    [
      { x: LEFT, title: "Signer Events" },
      { x: COLUMNS.second.x, title: "Signature" },
      { x: COLUMNS.third.x, title: "Timestamp" },
    ],
    signerRows.length ? rowHeight(layout, signerRows[0]) : 0,
  );
  signerRows.forEach((row, i) =>
    drawRow(layout, row, {
      gapAfter: 12,
      rule: i < signerRows.length - 1,
    }),
  );
  endTable(layout);

  const sentAt = firstEvent(input.events, ["sent"])?.at ?? input.createdAt;
  const deliveredAt = latest(
    signers.map(
      (s) =>
        s.viewedAt ??
        firstEvent(input.events, ["viewed"], s.id)?.at ??
        s.signedAt,
    ),
  );
  const signingCompleteAt = latest(signers.map((s) => s.signedAt));
  const summary: [string, string | undefined][] = [
    ["Envelope Sent", sentAt],
    ["Certified Delivered", deliveredAt],
    ["Signing Complete", signingCompleteAt],
    ["Completed", input.completedAt],
  ];
  startTable(
    layout,
    [
      { x: LEFT, title: "Envelope Summary Events" },
      { x: COLUMNS.second.x, title: "Status" },
      { x: COLUMNS.third.x, title: "Timestamps" },
    ],
    leadingFor(BODY),
  );
  for (const [label, at] of summary) {
    drawRow(
      layout,
      [
        cell(COLUMNS.first, [text([{ text: label }])], 6),
        cell(COLUMNS.second, [text([{ text: "Security Checked" }])]),
        cell(COLUMNS.third, [text([{ text: stamp(at) }])]),
      ],
      { gapAfter: 3 },
    );
  }
  endTable(layout);

  startTable(
    layout,
    [
      { x: LEFT, title: "Document Fingerprints" },
      { x: COLUMNS.second.x, title: "SHA-256" },
    ],
    2 * leadingFor(BODY),
  );
  const fingerprints: [string, string, string][] = [
    ["Original document", input.sourceFilename, input.sourceSha256],
    ["Signed document", "Stamped with every signature", input.signedSha256],
  ];
  for (const [label, detail, hash] of fingerprints) {
    drawRow(
      layout,
      [
        cell(
          COLUMNS.first,
          [
            text([{ text: label, bold: true }]),
            text([{ text: detail, muted: true }], SMALL),
          ],
          6,
        ),
        cell(COLUMNS.wide, [text([{ text: hash.toLowerCase() }], SMALL)]),
      ],
      { gapAfter: 6 },
    );
  }
  endTable(layout);

  drawRow(
    layout,
    [
      cell(COLUMNS.full, [
        text(
          [
            {
              text: "BrockCSC Sign is an internal club record. It is not a certified or regulated electronic signature service.",
              muted: true,
            },
          ],
          SMALL,
        ),
      ]),
    ],
    { gapAfter: 8 },
  );

  const heading = "Electronic Record and Signature Disclosure";
  const paragraphs = input.disclosureText
    .split(/\n\s*\n/)
    .map(singleLine)
    .filter(Boolean);
  if (paragraphs[0]?.toLowerCase() === heading.toLowerCase())
    paragraphs.shift();
  const accepted = signers.filter(
    (s) => s.consentedAt || firstEvent(input.events, ["consented"], s.id),
  );
  startTable(layout, [{ x: LEFT, title: heading }], 3 * leadingFor(BODY));
  layout.table = null;
  drawRow(
    layout,
    [
      cell(
        COLUMNS.full,
        [
          pair("Version", input.disclosureVersion),
          pair(
            "Accepted by",
            accepted.map((s) => s.fullName).join(", ") || "None recorded",
          ),
        ],
        6,
      ),
    ],
    { gapAfter: 6 },
  );
  for (const paragraph of paragraphs) {
    const lines = wrapText(fonts.sans.pdf, paragraph, BODY, CONTENT_WIDTH - 12);
    ensureSpace(layout, Math.min(lines.length * leadingFor(BODY), 160));
    lines.forEach((line, i) => {
      ensureSpace(layout, leadingFor(BODY) + (i === lines.length - 1 ? 6 : 0));
      layout.page.drawText(line, {
        x: LEFT + 6,
        y: layout.y - BODY,
        size: BODY,
        font: fonts.sans.pdf,
        color: TEXT,
      });
      layout.y -= leadingFor(BODY);
    });
    layout.y -= 6;
  }

  const pageCount = layout.pages.length;
  for (const finish of layout.afterLayout) finish(pageCount);
  layout.pages.forEach((page, i) => {
    page.drawLine({
      start: { x: LEFT, y: 44 },
      end: { x: RIGHT, y: 44 },
      thickness: 0.5,
      color: RULE,
    });
    page.drawText(
      `BrockCSC Sign Envelope ID: ${singleLine(input.envelopeId)}`,
      {
        x: LEFT,
        y: 32,
        size: SMALL,
        font: fonts.sans.pdf,
        color: MUTED,
      },
    );
    const label = `Page ${i + 1} of ${pageCount}`;
    page.drawText(label, {
      x: RIGHT - fonts.sans.pdf.widthOfTextAtSize(label, SMALL),
      y: 32,
      size: SMALL,
      font: fonts.sans.pdf,
      color: MUTED,
    });
  });

  doc.setTitle(
    `Certificate of Completion - ${singleLine(input.documentTitle)}`,
  );
  doc.setSubject(`BrockCSC Sign envelope ${singleLine(input.envelopeId)}`);
  doc.setProducer("BrockCSC Sign");
  doc.setCreator("BrockCSC Sign");
  const completed = new Date(input.completedAt);
  if (!Number.isNaN(completed.getTime())) {
    doc.setCreationDate(completed);
    doc.setModificationDate(completed);
  }
  return doc.save();
};
