import { PDFDocument } from "pdf-lib";

/** Concatenates whole PDFs, in order, into one new PDF. */
export const buildCombinedPdf = async (
  pdfs: Uint8Array[],
): Promise<Uint8Array> => {
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const source = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pages = await out.copyPages(source, source.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
};
