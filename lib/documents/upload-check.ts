const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Mirrors the upload routes' checks so a wrong file fails before it is sent. */
export const pdfUploadProblem = (file: File): string | null => {
  // Some systems report no type for a .pdf; the server checks the bytes either way.
  const pdfByName = !file.type && /\.pdf$/i.test(file.name);
  if (file.type !== "application/pdf" && !pdfByName) {
    return "Only PDF files can be uploaded. Export or save it as a PDF, then try again.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "That file is larger than 15MB.";
  return null;
};
