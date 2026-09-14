import { NextResponse, type NextRequest } from "next/server";
import type { CompletedEnvelopeView, DocumentRecord } from "@/lib/api/types";
import { findById } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import { envelopeIdFor } from "@/lib/documents/envelope";
import { findValidViewToken } from "@/lib/documents/tokens";
import { rateLimit } from "@/lib/rate-limit";

/** An external signer's read-only view of the envelope they signed, once it completed. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-signed-view", 60, 60 * 60 * 1000);
  if (limited) return limited;

  const { token } = await params;
  const request = (await findValidViewToken(token))?.request;
  if (!request?.completedAt) {
    return NextResponse.json(
      { error: "This link is invalid or has expired." },
      { status: 404 },
    );
  }
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  const base = `/api/documents/signed/${encodeURIComponent(token)}/file`;
  const view: CompletedEnvelopeView = {
    envelopeId: envelopeIdFor(request),
    documentTitle: document?.title ?? request.title,
    requestTitle: request.title,
    completedAt: request.completedAt,
    signedFileUrl: `${base}?which=signed`,
    certificateUrl: `${base}?which=certificate`,
  };
  return NextResponse.json(view, {
    headers: { "cache-control": "private, no-store" },
  });
};
