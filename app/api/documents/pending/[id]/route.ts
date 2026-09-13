import { NextResponse, type NextRequest } from "next/server";
import type {
  AddSignerPayload,
  CancelSigningPayload,
  DeletePayload,
  RemoveSignerPayload,
  ReplacePayload,
  StartSigningPayload,
  UploadPayload,
} from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import {
  addVersion,
  createDocumentWithVersion,
  deleteDocument,
} from "@/lib/documents/mutations";
import { findPendingAction, markPendingAction } from "@/lib/documents/pending";
import {
  addSignerToRequest,
  cancelSigningRequest,
  removeSignerFromRequest,
  startSigningRequest,
} from "@/lib/documents/signing";
import { deleteDocumentFile } from "@/lib/documents/storage";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();

  const body = await jsonObject<{ action?: string; reason?: string }>(req);
  if (!body) return badJson();
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { id } = await params;
  const pending = await findPendingAction(id);
  if (!pending) return notFound();
  if (pending.status !== "pending") {
    return NextResponse.json(
      { error: "This request was already reviewed." },
      { status: 409 },
    );
  }

  if (body.action === "reject") {
    if (pending.kind === "upload" || pending.kind === "replace") {
      await deleteDocumentFile(
        (pending.payload as UploadPayload | ReplacePayload).storedFilename,
      );
    }
    const updated = await markPendingAction(
      id,
      approver,
      "rejected",
      body.reason,
    );
    if (!updated) return notFound();
    return NextResponse.json(toWireRecord(updated));
  }

  const proposer = {
    sub: pending.proposedBy,
    name: pending.proposedByName ?? "",
    email: pending.proposedByEmail,
  };

  try {
    switch (pending.kind) {
      case "upload":
        await createDocumentWithVersion(
          proposer,
          pending.payload as UploadPayload,
        );
        break;
      case "replace":
        await addVersion(proposer, pending.payload as ReplacePayload);
        break;
      case "delete":
        await deleteDocument(pending.payload as DeletePayload);
        break;
      case "start-signing":
        await startSigningRequest(
          proposer,
          pending.payload as StartSigningPayload,
        );
        break;
      case "add-signer":
        await addSignerToRequest(pending.payload as AddSignerPayload);
        break;
      case "remove-signer":
        await removeSignerFromRequest(pending.payload as RemoveSignerPayload);
        break;
      case "cancel-signing":
        await cancelSigningRequest(
          pending.payload as CancelSigningPayload,
          proposer,
        );
        break;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not apply this action.",
      },
      { status: 409 },
    );
  }

  const updated = await markPendingAction(id, approver, "approved");
  if (!updated) return notFound();
  return NextResponse.json(toWireRecord(updated));
};
