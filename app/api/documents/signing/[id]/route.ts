import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, SigningRequestRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable, signingRequestsTable } from "@/lib/db/schema";
import { redactSigningRequest } from "@/lib/documents/signing";
import { notAuthorized, notFound } from "@/lib/json";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    id,
  );
  if (!request) return notFound();
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  return NextResponse.json({
    signingRequest: toWireRecord(redactSigningRequest(request)),
    document: document ? toWireRecord(document) : null,
  });
};
