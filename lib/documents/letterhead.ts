import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  BRAND_ACCENT_COLOR,
  BRAND_COLOR,
  CLUB_MAILING_ADDRESS,
  CLUB_NAME,
} from "@/lib/brand";

/** PDF points. lib/documents/page-size.ts holds the CSS-pixel sizes used by the HTML preview. */
export const PDF_LETTER_WIDTH = 612;
export const PDF_LETTER_HEIGHT = 792;
export const PDF_LETTER_MARGIN = 56;

export const hexDigits = (hex: string) => hex.replace(/^#/, "").toUpperCase();

export const hexToRgb = (hex: string) => {
  const clean = hexDigits(hex);
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
};

export const readLogoBytes = () =>
  readFile(join(process.cwd(), "public/email-logo.png"));

/**
 * Club letterhead across the top of `page`; returns the y where content
 * starts. The strings are the ASCII brand constants, so the standard
 * Helvetica fonts are safe here even in documents that draw data in Noto.
 */
export const drawLetterhead = (
  page: PDFPage,
  assets: { logo: PDFImage; font: PDFFont; bold: PDFFont },
) => {
  const brand = hexToRgb(BRAND_COLOR);
  const logoSize = 40;
  const top = PDF_LETTER_HEIGHT - PDF_LETTER_MARGIN;
  const dividerX = PDF_LETTER_MARGIN + logoSize + 10;
  const textX = dividerX + 12;
  page.drawImage(assets.logo, {
    x: PDF_LETTER_MARGIN,
    y: top - logoSize,
    width: logoSize,
    height: logoSize,
  });
  page.drawLine({
    start: { x: dividerX, y: top },
    end: { x: dividerX, y: top - logoSize },
    thickness: 2,
    color: hexToRgb(BRAND_ACCENT_COLOR),
  });
  page.drawText(CLUB_NAME, {
    x: textX,
    y: top - 14,
    size: 12,
    font: assets.bold,
    color: brand,
  });
  page.drawText(CLUB_MAILING_ADDRESS, {
    x: textX,
    y: top - 28,
    size: 8,
    font: assets.font,
    color: rgb(0x6b / 255, 0x72 / 255, 0x80 / 255),
  });
  const ruleY = top - logoSize - 8;
  page.drawLine({
    start: { x: PDF_LETTER_MARGIN, y: ruleY },
    end: { x: PDF_LETTER_WIDTH - PDF_LETTER_MARGIN, y: ruleY },
    thickness: 2,
    color: brand,
  });
  return ruleY - 24;
};
