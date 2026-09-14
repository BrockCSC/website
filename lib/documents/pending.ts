import { and, eq, sql } from "drizzle-orm";
import type {
  AddSignerPayload,
  CancelSigningPayload,
  DeletePayload,
  DocumentRecord,
  PendingActionPayload,
  PendingDocumentActionKind,
  PendingDocumentActionRecord,
  RemoveSignerPayload,
  ReplacePayload,
  SessionUser,
  SignerInput,
  SigningRequestRecord,
  SignupRecord,
  StartSigningPayload,
  UploadPayload,
} from "@/lib/api/types";
import { hasApproverRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  type Entity,
  create,
  findAll,
  findById,
  toEntity,
  update,
} from "@/lib/db/repository";
import {
  documentsTable,
  pendingDocumentActionsTable,
  signingRequestsTable,
  signupsTable,
} from "@/lib/db/schema";

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
  if (hasApproverRole(user)) {
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

/** Every status, not just pending, so a proposer can see what became of their own submissions. */
export const listPendingActionsForUser = async (
  sub: string,
): Promise<Entity<PendingDocumentActionRecord>[]> =>
  (await findAll<PendingDocumentActionRecord>(pendingDocumentActionsTable))
    .filter((a) => a.proposedBy === sub)
    .sort(
      (a, b) =>
        new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime(),
    );

export const findPendingAction = (id: string) =>
  findById<PendingDocumentActionRecord>(pendingDocumentActionsTable, id);

/**
 * Atomically moves a pending row out of "pending" — the WHERE clause is the
 * whole point: two co-presidents reviewing the same row at once can't both
 * win, unlike a plain read-then-write. Returns null if someone already beat
 * this call to it.
 */
export const markPendingAction = async (
  id: string,
  reviewer: SessionUser,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<Entity<PendingDocumentActionRecord> | null> => {
  const patch: Partial<PendingDocumentActionRecord> = {
    status: decision,
    reviewedBy: reviewer.sub,
    reviewedByName: reviewer.name,
    reviewedAt: new Date().toISOString(),
    rejectionReason: reason,
  };
  const rows = await db
    .update(pendingDocumentActionsTable)
    .set({ data: sql`${pendingDocumentActionsTable.data} || ${patch}::jsonb` })
    .where(
      and(
        eq(pendingDocumentActionsTable.id, id),
        sql`${pendingDocumentActionsTable.data}->>'status' = 'pending'`,
      ),
    )
    .returning();
  return rows[0] ? toEntity<PendingDocumentActionRecord>(rows[0]) : null;
};

/** Undoes a claim whose mutation then failed to apply, so it can be reviewed again. */
export const revertPendingClaim = (id: string) =>
  update<PendingDocumentActionRecord>(pendingDocumentActionsTable, id, {
    status: "pending",
  });

type SignerSummary = { name: string; kind: "member" | "external" };

export type PendingActionTarget = {
  documentTitle?: string;
  signingRequestTitle?: string;
  signingRequestMode?: "ordered" | "parallel";
  signers?: SignerSummary[];
  note?: string;
};

const documentTarget = async (
  documentId: string,
): Promise<PendingActionTarget> => {
  const document = await findById<DocumentRecord>(documentsTable, documentId);
  return document ? { documentTitle: document.title } : {};
};

const memberName = async (signupId: string): Promise<string> => {
  const signup = await findById<SignupRecord>(signupsTable, signupId);
  if (!signup) return "Unknown member";
  return (
    [signup.firstName, signup.lastName].filter(Boolean).join(" ") ||
    signup.username ||
    "Member"
  );
};

const signerSummaries = async (
  inputs: SignerInput[],
): Promise<SignerSummary[]> =>
  Promise.all(
    inputs.map(async (s) =>
      s.kind === "member"
        ? { name: await memberName(s.signupId), kind: "member" as const }
        : { name: `${s.name} <${s.email}>`, kind: "external" as const },
    ),
  );

/**
 * Everything a co-president needs to judge a queued action without hunting
 * through the library separately: what document, what signing request, and
 * who's being added or removed.
 */
export const buildPendingActionTarget = async (
  item: Entity<PendingDocumentActionRecord>,
): Promise<PendingActionTarget> => {
  switch (item.kind) {
    case "upload": {
      const p = item.payload as UploadPayload;
      return { documentTitle: p.title };
    }
    case "replace": {
      const p = item.payload as ReplacePayload;
      return { ...(await documentTarget(p.documentId)), note: p.note };
    }
    case "delete": {
      const p = item.payload as DeletePayload;
      return documentTarget(p.documentId);
    }
    case "start-signing": {
      const p = item.payload as StartSigningPayload;
      return {
        ...(await documentTarget(p.documentId)),
        signingRequestTitle: p.title,
        signingRequestMode: p.mode,
        signers: await signerSummaries(p.signers),
      };
    }
    case "add-signer": {
      const p = item.payload as AddSignerPayload;
      const request = await findById<SigningRequestRecord>(
        signingRequestsTable,
        p.signingRequestId,
      );
      return {
        ...(request ? await documentTarget(request.documentId) : {}),
        signingRequestTitle: request?.title,
        signingRequestMode: request?.mode,
        signers: await signerSummaries([p.signer]),
      };
    }
    case "remove-signer": {
      const p = item.payload as RemoveSignerPayload;
      const request = await findById<SigningRequestRecord>(
        signingRequestsTable,
        p.signingRequestId,
      );
      const signer = request?.signers.find((s) => s.id === p.signerId);
      return {
        ...(request ? await documentTarget(request.documentId) : {}),
        signingRequestTitle: request?.title,
        signers: signer
          ? [
              {
                name:
                  signer.kind === "member"
                    ? (signer.name ?? "Member")
                    : `${signer.name ?? "Signer"} <${signer.email ?? ""}>`,
                kind: signer.kind,
              },
            ]
          : [],
      };
    }
    case "cancel-signing": {
      const p = item.payload as CancelSigningPayload;
      const request = await findById<SigningRequestRecord>(
        signingRequestsTable,
        p.signingRequestId,
      );
      return {
        ...(request ? await documentTarget(request.documentId) : {}),
        signingRequestTitle: request?.title,
        signingRequestMode: request?.mode,
      };
    }
  }
};
