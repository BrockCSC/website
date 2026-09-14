import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, UploadPayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findAll, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import { createDocumentWithVersion } from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  sniffDocumentType,
  storeDocumentBytes,
} from "@/lib/documents/storage";
import { notAuthorized } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

export const GET = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const documents = await findAll<DocumentRecord>(documentsTable);
  return NextResponse.json(documents.map(toWireRecord));
};

const TOO_LARGE = () =>
  NextResponse.json(
    { error: "That file is larger than 15MB." },
    { status: 413 },
  );

export const POST = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const limited = rateLimit(
    req,
    "documents-upload",
    30,
    60 * 60 * 1000,
    user.sub,
  );
  if (limited) return limited;

  // formData() buffers the whole body, so a declared length over the cap is rejected up front.
  const declaredLength = Number(req.headers.get("content-length"));
  if (!(declaredLength > 0 && declaredLength <= MAX_DOCUMENT_BYTES))
    return TOO_LARGE();

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!(file instanceof File) || !title) {
    return NextResponse.json(
      { error: "A title and a file are required." },
      { status: 400 },
    );
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
  const payload: UploadPayload = {
    title,
    description: description || undefined,
    storedFilename,
    originalFilename: file.name || "document",
    contentType: declaredType,
    size: bytes.byteLength,
    sha256,
  };

  const outcome = await proposeOrApply(user, "upload", payload, {}, () =>
    createDocumentWithVersion({ sub: user.sub, name: user.name }, payload),
  );
  return outcome.applied
    ? NextResponse.json(toWireRecord(outcome.result.document), { status: 201 })
    : NextResponse.json(
        { pending: toWireRecord(outcome.pending) },
        { status: 202 },
      );
};
