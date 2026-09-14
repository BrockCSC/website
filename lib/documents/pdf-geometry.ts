import {
  PDFArray,
  PDFName,
  PDFNumber,
  type PDFPage,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";

type Box = [number, number, number, number];

/** The page as a viewer shows it: crop box, then /Rotate applied. */
export type PageFrame = {
  width: number;
  height: number;
  /** Maps upright page space (origin bottom-left as displayed, y up) to PDF user space. */
  matrix: [number, number, number, number, number, number];
};

const LETTER: Box = [0, 0, 612, 792];

const readBox = (page: PDFPage, name: string): Box | null => {
  const { context } = page.node;
  const value = context.lookup(
    page.node.getInheritableAttribute(PDFName.of(name)),
  );
  if (!(value instanceof PDFArray) || value.size() !== 4) return null;
  const numbers = value.asArray().map((item) => context.lookup(item));
  if (!numbers.every((n) => n instanceof PDFNumber)) return null;
  const [a, b, c, d] = numbers.map((n) => (n as PDFNumber).asNumber());
  const box: Box = [
    Math.min(a, c),
    Math.min(b, d),
    Math.max(a, c),
    Math.max(b, d),
  ];
  return box[2] - box[0] > 0 && box[3] - box[1] > 0 ? box : null;
};

const readRotation = (page: PDFPage) => {
  const { context } = page.node;
  const value = context.lookup(
    page.node.getInheritableAttribute(PDFName.of("Rotate")),
  );
  const degrees = value instanceof PDFNumber ? value.asNumber() : 0;
  if (!Number.isFinite(degrees) || degrees % 90 !== 0) return 0;
  return ((degrees % 360) + 360) % 360;
};

/**
 * Mirrors pdfjs-dist's PDFPageProxy.view (CropBox clipped to MediaBox) and
 * PageViewport rotation, so a point stored as a % of the pdfjs viewport lands
 * on the same spot here.
 */
export const readPageFrame = (page: PDFPage): PageFrame => {
  const media = readBox(page, "MediaBox") ?? LETTER;
  const crop = readBox(page, "CropBox");
  let view = media;
  if (crop) {
    const clipped: Box = [
      Math.max(crop[0], media[0]),
      Math.max(crop[1], media[1]),
      Math.min(crop[2], media[2]),
      Math.min(crop[3], media[3]),
    ];
    if (clipped[2] - clipped[0] > 0 && clipped[3] - clipped[1] > 0) {
      view = clipped;
    }
  }
  const [x0, y0, x1, y1] = view;
  const w = x1 - x0;
  const h = y1 - y0;
  switch (readRotation(page)) {
    case 90:
      return { width: h, height: w, matrix: [0, 1, -1, 0, x1, y0] };
    case 180:
      return { width: w, height: h, matrix: [-1, 0, 0, -1, x1, y1] };
    case 270:
      return { width: h, height: w, matrix: [0, -1, 1, 0, x0, y1] };
    default:
      return { width: w, height: h, matrix: [1, 0, 0, 1, x0, y0] };
  }
};

/** Runs draw calls in upright page space; pdf-lib has already wrapped the original content in q/Q. */
export const drawUpright = (
  page: PDFPage,
  frame: PageFrame,
  draw: () => void,
) => {
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...frame.matrix),
  );
  draw();
  page.pushOperators(popGraphicsState());
};
