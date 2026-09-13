import type {
  DeletePayload,
  DocumentRecord,
  DocumentVersionRecord,
  ReplacePayload,
  SigningRequestRecord,
  UploadPayload,
} from "@/lib/api/types";
import {
  type Entity,
  create,
  findAll,
  findById,
  remove,
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
    category: payload.category,
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

export const addVersion = async (
  actor: Actor,
  payload: ReplacePayload,
): Promise<Entity<DocumentVersionRecord>> => {
  const document = await findById<DocumentRecord>(
    documentsTable,
    payload.documentId,
  );
  if (!document) throw new Error("Document not found.");

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

/** Refused while a signing request is in flight, so a document can't vanish out from under a signer mid-review. */
export const deleteDocument = async (payload: DeletePayload): Promise<void> => {
  const requests = await signingRequestsForDocument(payload.documentId);
  if (requests.some((r) => r.status === "sent")) {
    throw new Error(
      "Cancel the in-progress signing request before deleting this document.",
    );
  }

  const versions = await versionsForDocument(payload.documentId);
  for (const version of versions) {
    await deleteDocumentFile(version.storedFilename);
    await remove(documentVersionsTable, version.id);
  }
  for (const request of requests) {
    await remove(signingRequestsTable, request.id);
  }
  await remove(documentsTable, payload.documentId);
};
