import type {
  PendingActionPayload,
  PendingDocumentActionKind,
  PendingDocumentActionRecord,
  SessionUser,
} from "@/lib/api/types";
import {
  type Entity,
  create,
  findAll,
  findById,
  update,
} from "@/lib/db/repository";
import { pendingDocumentActionsTable } from "@/lib/db/schema";

export type ApplyOutcome<T> =
  | { applied: true; result: T }
  | { applied: false; pending: Entity<PendingDocumentActionRecord> };

/**
 * Mirrors consequences.ts's shape: an approver's action runs immediately;
 * anyone else's is queued for a co-president or owner to approve.
 */
export const proposeOrApply = async <T>(
  user: SessionUser,
  kind: PendingDocumentActionKind,
  payload: PendingActionPayload,
  target: { documentId?: string; signingRequestId?: string },
  apply: () => Promise<T>,
): Promise<ApplyOutcome<T>> => {
  if (user.isApprover) {
    return { applied: true, result: await apply() };
  }
  const pending = await create<PendingDocumentActionRecord>(
    pendingDocumentActionsTable,
    {
      kind,
      proposedBy: user.sub,
      proposedByName: user.name,
      proposedByEmail: user.email,
      proposedAt: new Date().toISOString(),
      payload,
      status: "pending",
      targetDocumentId: target.documentId,
      targetSigningRequestId: target.signingRequestId,
    },
  );
  return { applied: false, pending };
};

export const listPendingActions = async (): Promise<
  Entity<PendingDocumentActionRecord>[]
> =>
  (await findAll<PendingDocumentActionRecord>(pendingDocumentActionsTable))
    .filter((a) => a.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime(),
    );

export const findPendingAction = (id: string) =>
  findById<PendingDocumentActionRecord>(pendingDocumentActionsTable, id);

export const markPendingAction = async (
  id: string,
  reviewer: SessionUser,
  decision: "approved" | "rejected",
  reason?: string,
) =>
  update<PendingDocumentActionRecord>(pendingDocumentActionsTable, id, {
    status: decision,
    reviewedBy: reviewer.sub,
    reviewedByName: reviewer.name,
    reviewedAt: new Date().toISOString(),
    rejectionReason: reason,
  });
