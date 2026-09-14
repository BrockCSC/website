"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocumentPreview } from "@/components/documents/document-preview";
import { FillableField } from "@/components/documents/fillable-field";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  addSigner,
  cancelSigningRequest,
  fetchMemberOptions,
  fetchMySignature,
  fetchSigningRequest,
  removeSigner,
  resendSignerLink,
  respondToMySignature,
  documentFileUrl,
  type DocumentItem,
  type MemberOption,
  type SigningRequestItem,
} from "@/lib/api/documents";
import type { SafeSigner } from "@/lib/api/documents";
import type { SigningField } from "@/lib/api/types";
import {
  SIGNING_FIELD_DEFAULT_LABEL,
  todayIsoLocal,
} from "@/lib/documents/fields";
import { useSession } from "../../../session";
import { CompletedDocuments } from "@/components/documents/completed-documents";
import {
  SignerActivity,
  signerStatusLabel,
} from "@/components/documents/signer-activity";
import { SignerSwatch } from "@/components/documents/placement-tools";
import { SigningTimeline } from "@/components/documents/signing-timeline";
import { signerColor } from "@/lib/documents/signer-colors";
import { formatSigningTime } from "@/lib/documents/signing-time";
import { ask } from "../../../ask";
import { Note, Panel, Pill, Rows, field } from "../../../users/ui";

const statusTone = (status: string) =>
  status === "signed" || status === "completed" ? "accent" : "flat";

function MySignaturePanel({
  signingRequestId,
  onChanged,
}: {
  signingRequestId: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<{
    document: { title: string } | null;
    version: { contentType: string } | null;
    versionId: string;
    signer: SafeSigner;
    fields: SigningField[];
    canRespond: boolean;
  } | null>(null);
  const [applicable, setApplicable] = useState(true);
  const [signatureText, setSignatureText] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMySignature(signingRequestId)
      .then((data) => {
        setView(data);
        setFieldValues(
          Object.fromEntries(
            data.fields
              .filter((f) => f.type === "date")
              .map((f) => [f.id, todayIsoLocal()]),
          ),
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setApplicable(false);
      });
  }, [signingRequestId]);

  if (!applicable || !view) return null;

  const missingRequiredField = view.fields.some(
    (f) => f.required && f.type !== "signature" && !fieldValues[f.id]?.trim(),
  );

  const sign = async () => {
    if (!signatureText.trim() || missingRequiredField) return;
    setBusy(true);
    setError(null);
    try {
      const values = Object.fromEntries(
        view.fields.map((f) => [
          f.id,
          f.type === "signature"
            ? signatureText.trim()
            : (fieldValues[f.id]?.trim() ?? ""),
        ]),
      );
      await respondToMySignature(signingRequestId, {
        action: "sign",
        signatureText: signatureText.trim(),
        fieldValues: values,
      });
      onChanged();
      setView(null);
      setApplicable(false);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not record your signature.",
      );
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await respondToMySignature(signingRequestId, {
        action: "decline",
        reason: declineReason.trim() || undefined,
      });
      onChanged();
      setView(null);
      setApplicable(false);
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) || "Could not record that.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Your signature" tone="danger">
      <a
        className="font-bold text-brand underline underline-offset-4"
        href={documentFileUrl(view.versionId)}
        rel="noreferrer"
        target="_blank"
      >
        Open the document to review
      </a>
      <p className="mt-2 text-sm text-subtle">Status: {view.signer.status}</p>

      {view.canRespond && (
        <div className="mt-4">
          {declining ? (
            <div>
              <textarea
                className={`${field} min-h-[70px]`}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason (optional)"
                value={declineReason}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={busy}
                  onClick={decline}
                  type="button"
                  variant="destructive"
                >
                  Confirm decline
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setDeclining(false)}
                  type="button"
                  variant="secondary"
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {!!view.fields.length && view.version && (
                <div className="mb-4">
                  <p className="mb-2 text-xs text-subtle">
                    Your fields are marked below. Signature fields show the name
                    you type further down.
                  </p>
                  <DocumentPreview
                    contentType={view.version.contentType}
                    fileUrl={documentFileUrl(view.versionId)}
                    key={view.versionId}
                    overlay={(page) => (
                      <>
                        {view.fields
                          .filter((f) => f.page === page)
                          .map((f) => (
                            <FillableField
                              key={f.id}
                              label={
                                f.label ?? SIGNING_FIELD_DEFAULT_LABEL[f.type]
                              }
                              onChange={(v) =>
                                setFieldValues((prev) => ({
                                  ...prev,
                                  [f.id]: v,
                                }))
                              }
                              required={f.required}
                              type={f.type}
                              value={
                                f.type === "signature"
                                  ? signatureText
                                  : (fieldValues[f.id] ?? "")
                              }
                              xPercent={f.xPercent}
                              yPercent={f.yPercent}
                            />
                          ))}
                      </>
                    )}
                  />
                </div>
              )}
              <input
                className={field}
                onChange={(e) => setSignatureText(e.target.value)}
                placeholder="Type your full name to sign"
                value={signatureText}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={
                    busy || !signatureText.trim() || missingRequiredField
                  }
                  onClick={sign}
                  type="button"
                  variant="primary"
                >
                  Sign
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                  type="button"
                  variant="outline"
                >
                  Decline
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm font-bold text-destructive">{error}</p>
      )}
    </Panel>
  );
}

export default function SigningRequestPage() {
  const id = useParams().id as string;
  const { user } = useSession();
  const [signingRequest, setSigningRequest] =
    useState<SigningRequestItem | null>(null);
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");

  const load = useCallback(async () => {
    try {
      const detail = await fetchSigningRequest(id);
      setSigningRequest(detail.signingRequest);
      setDocument(detail.document);
      setError(null);
    } catch {
      setError("Could not load this signing request.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // The full request detail (and the member picker) is admin-only — a
    // member-but-not-exec signer only ever sees their own signature panel
    // below, fed by the separately-gated my-signature endpoint.
    if (!user?.isExecutive) return;
    void (async () => {
      await load();
    })();
    void fetchMemberOptions()
      .then(setMembers)
      .catch(() => {});
  }, [load, user?.isExecutive]);

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    failure: string,
  ) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const result = await work();
      if (result && typeof result === "object" && "pending" in result) {
        setNote("Submitted for a co-president to approve.");
      }
      await load();
    } catch (err) {
      setError((err instanceof ApiError && err.detail) || failure);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const confirmed = await ask({
      title: "Cancel this signing request?",
      detail: "Every outstanding link stops working.",
      confirmLabel: "Cancel request",
      destructive: true,
    });
    if (confirmed === null) return;
    await run("cancel", () => cancelSigningRequest(id), "Could not cancel.");
  };

  const removeSignerRow = (signerId: string) =>
    run(
      `remove:${signerId}`,
      () => removeSigner(id, signerId),
      "Could not remove that signer.",
    );

  const resend = (signerId: string) =>
    run(
      `resend:${signerId}`,
      () => resendSignerLink(id, signerId),
      "Could not resend.",
    );

  const addMember = (signupId: string) => {
    if (!signupId) return;
    void run(
      "add",
      () => addSigner(id, { kind: "member", signupId }),
      "Could not add that signer.",
    );
  };

  const addExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalName.trim() || !externalEmail.trim()) return;
    await run(
      "add",
      () =>
        addSigner(id, {
          kind: "external",
          name: externalName.trim(),
          email: externalEmail.trim(),
        }),
      "Could not add that signer.",
    );
    setExternalName("");
    setExternalEmail("");
  };

  if (!user?.isMember) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only signed-in members can see signing requests.</Note>
      </div>
    );
  }
  // A member signer with no exec role (e.g. alumni) gets only their own
  // signature panel — the rest of this page manages the request and is
  // admin-only, matching /admin/documents and /admin/documents/[id].
  if (!user.isExecutive) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <MySignaturePanel onChanged={() => {}} signingRequestId={id} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <p className="font-bold text-subtle">Loading...</p>
      </div>
    );
  }
  if (!signingRequest) {
    return (
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>That signing request doesn&apos;t exist.</Note>
      </div>
    );
  }

  const active = signingRequest.status === "sent";

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 px-5 py-8">
      <div>
        {document && (
          <Link
            className="text-sm font-bold text-subtle hover:text-ink"
            href={`/admin/documents/${document.$key}`}
          >
            ← {document.title}
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-extrabold text-ink">
          {signingRequest.title}
        </h1>
        <p className="text-subtle">
          {signingRequest.mode === "ordered"
            ? "Signs in order"
            : "Signs in parallel"}
        </p>
      </div>

      {note && <p className="text-sm font-bold text-brand">{note}</p>}
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      <MySignaturePanel onChanged={load} signingRequestId={id} />

      <Panel
        action={
          active ? (
            <Button
              onClick={cancel}
              size="sm"
              type="button"
              variant="destructive"
            >
              Cancel request
            </Button>
          ) : undefined
        }
        title="Status"
      >
        <Rows
          items={[
            [
              "Status",
              <Pill key="s" tone={statusTone(signingRequest.status)}>
                {signingRequest.status}
              </Pill>,
            ],
            [
              "Requested by",
              signingRequest.createdByName || signingRequest.createdBy,
            ],
            ["Requested", formatSigningTime(signingRequest.createdAt)],
            ...(signingRequest.completedAt
              ? [
                  [
                    "Completed",
                    formatSigningTime(signingRequest.completedAt),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(signingRequest.cancelledAt
              ? [
                  [
                    "Cancelled",
                    formatSigningTime(signingRequest.cancelledAt),
                  ] as [string, React.ReactNode],
                ]
              : []),
          ]}
        />
      </Panel>

      {signingRequest.status === "completed" &&
        signingRequest.resultingVersionId && (
          <Panel
            note="A SHA-256 fingerprint changes if even one byte of its file does."
            title="Completed documents"
          >
            <CompletedDocuments request={signingRequest} />
          </Panel>
        )}

      <Panel title="Signers">
        <ul className="flex flex-col gap-3">
          {signingRequest.signers
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((signer) => (
              <li
                className="rounded-[14px] border-2 border-line bg-surface p-3"
                key={signer.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 font-bold text-ink">
                      <SignerSwatch color={signerColor(signer.order)} />
                      {signer.name ?? "Signer"}{" "}
                      <span className="font-normal break-all text-subtle">
                        ({signer.kind === "member" ? "member" : signer.email})
                      </span>
                    </p>
                    <SignerActivity request={signingRequest} signer={signer} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={statusTone(signer.status)}>
                      {signerStatusLabel(signer)}
                    </Pill>
                    {active && signer.status !== "signed" && (
                      <>
                        {user.isApprover && signer.notifiedAt && (
                          <Button
                            disabled={busy === `resend:${signer.id}`}
                            onClick={() => resend(signer.id)}
                            size="xs"
                            type="button"
                            variant="secondary"
                          >
                            Resend
                          </Button>
                        )}
                        <Button
                          disabled={busy === `remove:${signer.id}`}
                          onClick={() => removeSignerRow(signer.id)}
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
        </ul>

        {active && (
          <div className="mt-5 flex flex-col gap-3 border-t-2 border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={field}
                onChange={(e) => addMember(e.target.value)}
                value=""
              >
                <option value="">Add a member signer...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={addExternal}
            >
              <input
                className={field}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="External signer name"
                value={externalName}
              />
              <input
                className={field}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="Email"
                value={externalEmail}
              />
              <Button
                disabled={busy === "add"}
                type="submit"
                variant="secondary"
              >
                Add
              </Button>
            </form>
          </div>
        )}
      </Panel>

      <Panel note="Oldest first, in Toronto time." title="History">
        <SigningTimeline request={signingRequest} />
      </Panel>
    </div>
  );
}
