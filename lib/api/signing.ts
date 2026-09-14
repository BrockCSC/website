import { apiFetch } from "./client";
import type {
  CompletedEnvelopeView,
  SignResult,
  SignSubmission,
  SignerSessionView,
} from "./types";

/** External signers and in-portal member signers share one route shape under different bases. */
export const tokenSignerBase = (token: string) =>
  `/api/documents/sign/${encodeURIComponent(token)}`;

export const memberSignerBase = (signingRequestId: string) =>
  `/api/documents/signing/${encodeURIComponent(signingRequestId)}/my-signature`;

export const fetchSignerSession = (base: string) =>
  apiFetch<SignerSessionView>(base);

export const consentToSign = (base: string) =>
  apiFetch<{ consentedAt: string }>(`${base}/consent`, {
    method: "POST",
    body: "{}",
  });

export const submitSignature = (base: string, body: SignSubmission) =>
  apiFetch<SignResult>(base, { method: "POST", body: JSON.stringify(body) });

export const declineToSign = (base: string, reason?: string) =>
  apiFetch<{ signerStatus: "declined" }>(`${base}/decline`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });

export const fetchCompletedEnvelope = (token: string) =>
  apiFetch<CompletedEnvelopeView>(
    `/api/documents/signed/${encodeURIComponent(token)}`,
  );
