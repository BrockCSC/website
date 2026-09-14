import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, ReplacePayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import { addVersion } from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import {
  MAX_DOCUMENT_BYTES,
  checkUploadedPdf,
  deleteDocumentFile,
  storeDocumentBytes,
} from "@/lib/documents/storage";
import { notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

const TOO_LARGE = () =>
  NextResponse.json(
    { error: "That file is larger than 15MB." },
    { status: 413 },
  );

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const document = await findById<DocumentRecord>(documentsTable, id);
  if (!document) return notFound();

  const limited = rateLimit(
    req,
    "documents-upload",
    30,
    60 * 60 * 1000,
    user.sub,
  );
  if (limited) return limited;

  const declaredLength = Number(req.headers.get("content-length"));
  if (!(declaredLength > 0 && declaredLength <= MAX_DOCUMENT_BYTES))
    return TOO_LARGE();

  const form = await req.formData();
  const file = form.get("file");
  const note = String(form.get("note") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) return TOO_LARGE();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await checkUploadedPdf(bytes);
  if (!pdf.ok) {
    return NextResponse.json({ error: pdf.error }, { status: pdf.status });
  }

  const { storedFilename, sha256 } = await storeDocumentBytes(
    bytes,
    "application/pdf",
  );
  const payload: ReplacePayload = {
    documentId: id,
    storedFilename,
    originalFilename: file.name || "document.pdf",
    contentType: "application/pdf",
    size: bytes.byteLength,
    sha256,
    note: note || undefined,
  };

  try {
    const outcome = await proposeOrApply(
      user,
      "replace",
      payload,
      { documentId: id },
      () => addVersion({ sub: user.sub, name: user.name }, payload),
    );
    return outcome.applied
      ? NextResponse.json(toWireRecord(outcome.result), { status: 201 })
      : NextResponse.json(
          { pending: toWireRecord(outcome.pending) },
          { status: 202 },
        );
  } catch (err) {
    await deleteDocumentFile(storedFilename);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not upload that version.",
      },
      { status: 409 },
    );
  }
};
