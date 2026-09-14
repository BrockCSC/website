import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, RenamePayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import {
  deleteDocument,
  renameDocument,
  signingRequestsForDocument,
  versionsForDocument,
} from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import { redactSigningRequest } from "@/lib/documents/signing";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;

const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

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

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const document = await findById<DocumentRecord>(documentsTable, id);
  if (!document) return notFound();

  const body = await jsonObject<{ title?: unknown; description?: unknown }>(
    req,
  );
  if (!body) return badJson();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE) {
    return badRequest(`A title of 1 to ${MAX_TITLE} characters is required.`);
  }
  const payload: RenamePayload = { documentId: id, title };
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return badRequest("The description must be text.");
    }
    const description = body.description?.trim() || null;
    if (description && description.length > MAX_DESCRIPTION) {
      return badRequest(
        `The description can be at most ${MAX_DESCRIPTION} characters.`,
      );
    }
    payload.description = description;
  }

  try {
    const outcome = await proposeOrApply(
      user,
      "rename",
      payload,
      { documentId: id },
      () => renameDocument(payload),
    );
    return outcome.applied
      ? NextResponse.json(toWireRecord(outcome.result))
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
            : "Could not rename this document.",
      },
      { status: 409 },
    );
  }
};
