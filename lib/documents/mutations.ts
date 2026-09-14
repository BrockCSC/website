import { eq, sql } from "drizzle-orm";
import type {
  DeletePayload,
  DocumentRecord,
  DocumentVersionRecord,
  RenamePayload,
  ReplacePayload,
  SigningRequestRecord,
  UploadPayload,
} from "@/lib/api/types";
import { db } from "@/lib/db";
import {
  type Entity,
  create,
  findAll,
  findById,
  remove,
  toEntity,
  update,
} from "@/lib/db/repository";
import {
  documentsTable,
  documentVersionsTable,
  signingRequestsTable,
} from "@/lib/db/schema";
import { deleteDocumentFile } from "./storage";

export type Actor = { sub: string; name: string };

export const versionsForDocument = async (
  documentId: string,
): Promise<Entity<DocumentVersionRecord>[]> =>
  (await findAll<DocumentVersionRecord>(documentVersionsTable))
    .filter((v) => v.documentId === documentId)
    .sort(
      (a, b) =>
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    );

export const signingRequestsForDocument = async (
  documentId: string,
): Promise<Entity<SigningRequestRecord>[]> =>
  (await findAll<SigningRequestRecord>(signingRequestsTable))
    .filter((r) => r.documentId === documentId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

export const createDocumentWithVersion = async (
  actor: Actor,
  payload: UploadPayload,
): Promise<{
  document: Entity<DocumentRecord>;
  version: Entity<DocumentVersionRecord>;
}> => {
  const now = new Date().toISOString();
  const document = await create<DocumentRecord>(documentsTable, {
    title: payload.title,
    description: payload.description,
    currentVersionId: null,
    createdBy: actor.sub,
    createdByName: actor.name,
    createdAt: now,
  });
  const version = await create<DocumentVersionRecord>(documentVersionsTable, {
    documentId: document.id,
    storedFilename: payload.storedFilename,
    originalFilename: payload.originalFilename,
    contentType: payload.contentType,
    size: payload.size,
    sha256: payload.sha256,
    uploadedBy: actor.sub,
    uploadedByName: actor.name,
    uploadedAt: now,
  });
  const updated = await update<DocumentRecord>(documentsTable, document.id, {
    currentVersionId: version.id,
  });
  return { document: updated ?? document, version };
};

/** Versions, signing requests and certificates keep the old title: they record what was signed. */
export const renameDocument = async (
  payload: RenamePayload,
): Promise<Entity<DocumentRecord>> => {
  const patch: Partial<DocumentRecord> = { title: payload.title };
  if (payload.description) patch.description = payload.description;
  // A jsonb merge can't drop a key, so clearing strips it first.
  const base =
    payload.description === undefined
      ? documentsTable.data
      : sql`(${documentsTable.data} - 'description')`;
  const rows = await db
    .update(documentsTable)
    .set({ data: sql`${base} || ${patch}::jsonb` })
    .where(eq(documentsTable.id, payload.documentId))
    .returning();
  if (!rows[0]) throw new Error("Document not found.");
  return toEntity<DocumentRecord>(rows[0]);
};

/** Also enforced by startSigningRequest, so this can't be raced from the other side. */
const refuseWhileSigningInProgress = async (documentId: string) => {
  const requests = await signingRequestsForDocument(documentId);
  if (requests.some((r) => r.status === "sent")) {
    throw new Error(
      "Cancel the in-progress signing request before uploading a new version.",
    );
  }
};

export const addVersion = async (
  actor: Actor,
  payload: ReplacePayload,
): Promise<Entity<DocumentVersionRecord>> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    payload.documentId,
  );
  if (!document) throw new Error("Document not found.");
  // A version being signed is pinned by id, so this is only about not
  // confusing everyone else about what "current" means mid-signature.
  await refuseWhileSigningInProgress(payload.documentId);

  const version = await create<DocumentVersionRecord>(documentVersionsTable, {
    documentId: payload.documentId,
    storedFilename: payload.storedFilename,
    originalFilename: payload.originalFilename,
    contentType: payload.contentType,
    size: payload.size,
    sha256: payload.sha256,
    uploadedBy: actor.sub,
    uploadedByName: actor.name,
    uploadedAt: new Date().toISOString(),
    note: payload.note,
  });
  await update<DocumentRecord>(documentsTable, payload.documentId, {
    currentVersionId: version.id,
  });
  return version;
};

/**
 * Refused while a signing request is in flight, so a document can't vanish
 * out from under a signer mid-review, and refused once one has completed,
 * since that permanently destroys the only record the resolution was signed.
 */
export const deleteDocument = async (payload: DeletePayload): Promise<void> => {
  const requests = await signingRequestsForDocument(payload.documentId);
  if (requests.some((r) => r.status === "sent")) {
    throw new Error(
      "Cancel the in-progress signing request before deleting this document.",
    );
  }
  if (requests.some((r) => r.status === "completed")) {
    throw new Error(
      "This document has a completed, signed record and cannot be deleted.",
    );
  }

  const versions = await versionsForDocument(payload.documentId);
  for (const version of versions) {
    await deleteDocumentFile(version.storedFilename);
    await remove(documentVersionsTable, version.id);
  }
  for (const request of requests) {
    for (const signer of request.signers) {
      const { signatureImage, initialsImage } = signer.adopted ?? {};
      if (signatureImage) await deleteDocumentFile(signatureImage);
      if (initialsImage) await deleteDocumentFile(initialsImage);
    }
    await remove(signingRequestsTable, request.id);
  }
  await remove(documentsTable, payload.documentId);
};
