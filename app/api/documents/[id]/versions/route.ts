import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, ReplacePayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import { addVersion } from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  sniffDocumentType,
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

  const declaredType = file.type;
  if (!ALLOWED_DOCUMENT_TYPES.includes(declaredType)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, PNG, JPEG or DOCX." },
      { status: 415 },
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffDocumentType(bytes, declaredType)) {
    return NextResponse.json(
      { error: "The file's contents don't match its declared type." },
      { status: 415 },
    );
  }

  const { storedFilename, sha256 } = await storeDocumentBytes(
    bytes,
    declaredType,
  );
  const payload: ReplacePayload = {
    documentId: id,
    storedFilename,
    originalFilename: file.name || "document",
    contentType: declaredType,
    size: bytes.byteLength,
    sha256,
    note: note || undefined,
  };

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
};
