import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import {
  deleteDocument,
  signingRequestsForDocument,
  versionsForDocument,
} from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import { redactSigningRequest } from "@/lib/documents/signing";
import { notAuthorized, notFound } from "@/lib/json";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const document = await findById<DocumentRecord>(documentsTable, id);
  if (!document) return notFound();

  const [versions, signingRequests] = await Promise.all([
    versionsForDocument(id),
    signingRequestsForDocument(id),
  ]);
  return NextResponse.json({
    document: toWireRecord(document),
    versions: versions.map(toWireRecord),
    signingRequests: signingRequests.map((r) =>
      toWireRecord(redactSigningRequest(r)),
    ),
  });
};

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const document = await findById<DocumentRecord>(documentsTable, id);
  if (!document) return notFound();

  try {
    const outcome = await proposeOrApply(
      user,
      "delete",
      { documentId: id },
      { documentId: id },
      () => deleteDocument({ documentId: id }),
    );
    return outcome.applied
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(
          { pending: toWireRecord(outcome.pending) },
          { status: 202 },
        );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not delete this document.",
      },
      { status: 409 },
    );
  }
};
