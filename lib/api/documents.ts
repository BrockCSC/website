import { apiFetch, ApiError } from "./client";
import type {
  DocumentRecord,
  DocumentVersionRecord,
  PendingDocumentActionRecord,
  Signer,
  SignerInput,
  SigningField,
  SigningFieldInput,
  SigningRequestRecord,
  WithKey,
} from "./types";

export type DocumentItem = WithKey<DocumentRecord>;
export type DocumentVersionItem = WithKey<DocumentVersionRecord>;
type PendingActionTarget = {
  documentTitle?: string;
  signingRequestTitle?: string;
  signingRequestMode?: "ordered" | "parallel";
  signers?: { name: string; kind: "member" | "external" }[];
  note?: string;
};
export type PendingActionItem = WithKey<PendingDocumentActionRecord> & {
  target?: PendingActionTarget;
};
export type SafeSigner = Omit<Signer, "tokenHash">;
export type SigningRequestItem = WithKey<
  Omit<SigningRequestRecord, "signers">
> & {
  signers: SafeSigner[];
};

export const fetchDocuments = () => apiFetch<DocumentItem[]>("/api/documents");

export type MemberOption = { id: string; name: string };
export const fetchMemberOptions = () =>
  apiFetch<MemberOption[]>("/api/documents/members");

export const fetchDocumentDetail = (id: string) =>
  apiFetch<{
    document: DocumentItem;
    versions: DocumentVersionItem[];
    signingRequests: SigningRequestItem[];
  }>(`/api/documents/${id}`);

const postForm = async <T>(path: string, form: FormData): Promise<T> => {
  const res = await fetch(path, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${path} failed`, body?.error);
  }
  return body as T;
};

export const uploadDocument = (input: {
  title: string;
  description?: string;
  file: File;
}) => {
  const form = new FormData();
  form.set("title", input.title);
  if (input.description) form.set("description", input.description);
  form.set("file", input.file);
  return postForm<DocumentItem | { pending: PendingActionItem }>(
    "/api/documents",
    form,
  );
};

export const templateFileUrl = (templateId: string, format: "docx" | "pdf") =>
  `/api/documents/templates/${templateId}?format=${format}`;

export const addDocumentVersion = (
  documentId: string,
  file: File,
  note?: string,
) => {
  const form = new FormData();
  form.set("file", file);
  if (note) form.set("note", note);
  return postForm<DocumentVersionItem | { pending: PendingActionItem }>(
    `/api/documents/${documentId}/versions`,
    form,
  );
};

export const deleteDocument = async (
  id: string,
): Promise<{ pending?: PendingActionItem }> => {
  const res = await fetch(`/api/documents/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (res.status === 204) return {};
  const body = (await res.json().catch(() => null)) as {
    pending?: PendingActionItem;
    error?: string;
  } | null;
  if (!res.ok) throw new ApiError(res.status, "DELETE failed", body?.error);
  return body ?? {};
};

export const startSigningRequest = (
  documentId: string,
  input: {
    title: string;
    mode: "ordered" | "parallel";
    signers: SignerInput[];
    fields?: SigningFieldInput[];
  },
) =>
  apiFetch<SigningRequestItem | { pending: PendingActionItem }>(
    `/api/documents/${documentId}/signing`,
    { method: "POST", body: JSON.stringify(input) },
  );

export const fetchSigningRequest = (id: string) =>
  apiFetch<{
    signingRequest: SigningRequestItem;
    document: DocumentItem | null;
  }>(`/api/documents/signing/${id}`);

export const cancelSigningRequest = (id: string) =>
  apiFetch<SigningRequestItem | { pending: PendingActionItem }>(
    `/api/documents/signing/${id}/cancel`,
    { method: "POST" },
  );

export const addSigner = (signingRequestId: string, signer: SignerInput) =>
  apiFetch<SigningRequestItem | { pending: PendingActionItem }>(
    `/api/documents/signing/${signingRequestId}/signers`,
    { method: "POST", body: JSON.stringify({ signer }) },
  );

export const removeSigner = (signingRequestId: string, signerId: string) =>
  apiFetch<SigningRequestItem | { pending: PendingActionItem }>(
    `/api/documents/signing/${signingRequestId}/signers/${signerId}`,
    { method: "DELETE" },
  );

export const resendSignerLink = (signingRequestId: string, signerId: string) =>
  apiFetch<{ success: true }>(
    `/api/documents/signing/${signingRequestId}/resend`,
    {
      method: "POST",
      body: JSON.stringify({ signerId }),
    },
  );

export const fetchMySignature = (signingRequestId: string) =>
  apiFetch<{
    document: { title: string } | null;
    version: { contentType: string } | null;
    signingRequestId: string;
    signingRequestStatus: string;
    versionId: string;
    signer: SafeSigner;
    fields: SigningField[];
    canRespond: boolean;
  }>(`/api/documents/signing/${signingRequestId}/my-signature`);

export const respondToMySignature = (
  signingRequestId: string,
  body:
    | {
        action: "sign";
        signatureText: string;
        fieldValues?: Record<string, string>;
      }
    | { action: "decline"; reason?: string },
) =>
  apiFetch<{ success: true }>(
    `/api/documents/signing/${signingRequestId}/my-signature`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

export const fetchPendingActions = () =>
  apiFetch<PendingActionItem[]>("/api/documents/pending");

/** Every status, not just pending, scoped to what the caller themselves proposed. */
export const fetchMyPendingActions = () =>
  apiFetch<PendingActionItem[]>("/api/documents/pending?mine=1");

export const reviewPendingAction = (
  id: string,
  action: "approve" | "reject",
  reason?: string,
) =>
  apiFetch<PendingActionItem>(`/api/documents/pending/${id}`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });

export const documentFileUrl = (versionId: string) =>
  `/api/documents/files/${versionId}`;
export const pendingFileUrl = (pendingId: string) =>
  `/api/documents/pending/${pendingId}/file`;

/** Public, unauthenticated: the external signer's own view. */
export const fetchSignerView = (token: string) =>
  apiFetch<{
    document: { title: string } | null;
    version: { contentType: string } | null;
    signingRequestTitle: string;
    signingRequestStatus: string;
    mode: "ordered" | "parallel";
    signer: SafeSigner;
    fields: SigningField[];
    otherSigners: { order: number; status: string }[];
    canRespond: boolean;
  }>(`/api/documents/sign/${token}`);

export const respondAsSigner = (
  token: string,
  body:
    | {
        action: "sign";
        signatureText: string;
        fieldValues?: Record<string, string>;
      }
    | { action: "decline"; reason?: string },
) =>
  apiFetch<{ success: true }>(`/api/documents/sign/${token}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const signerFileUrl = (token: string) =>
  `/api/documents/sign/${token}/file`;
