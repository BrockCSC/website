"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MemberSigningPanel } from "@/components/documents/signing/signing-flow";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  addSigner,
  cancelSigningRequest,
  fetchMemberOptions,
  fetchSigningRequest,
  removeSigner,
  resendSignerLink,
  type DocumentItem,
  type MemberOption,
  type SigningRequestItem,
} from "@/lib/api/documents";
import { SIGNING_FIELD_DEFAULT_LABEL } from "@/lib/documents/fields";
import { useSession } from "../../../session";
import { ask } from "../../../ask";
import { Note, Panel, Pill, Rows, field } from "../../../users/ui";

const statusTone = (status: string) =>
  status === "signed" ? "accent" : "flat";

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
        <MemberSigningPanel onChanged={() => {}} signingRequestId={id} />
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

      <MemberSigningPanel onChanged={load} signingRequestId={id} />

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
            ["Requested", new Date(signingRequest.createdAt).toLocaleString()],
            ...(signingRequest.completedAt
              ? [
                  [
                    "Completed",
                    new Date(signingRequest.completedAt).toLocaleString(),
                  ] as [string, React.ReactNode],
                ]
              : []),
          ]}
        />
      </Panel>

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
                  <div>
                    <p className="font-bold text-ink">
                      {signer.name ?? "Signer"}{" "}
                      <span className="font-normal text-subtle">
                        ({signer.kind === "member" ? "member" : signer.email})
                      </span>
                    </p>
                    {signer.status === "signed" && (
                      <p className="text-xs text-subtle">
                        Signed &quot;{signer.signatureText}&quot; at{" "}
                        {signer.signedAt} from {signer.ip}
                      </p>
                    )}
                    {signer.status === "signed" &&
                      !!signer.fieldValues &&
                      signingRequest.fields
                        ?.filter((f) => f.signerId === signer.id)
                        .map(
                          (f) =>
                            signer.fieldValues![f.id] && (
                              <p className="text-xs text-subtle" key={f.id}>
                                {f.label ?? SIGNING_FIELD_DEFAULT_LABEL[f.type]}
                                : &quot;{signer.fieldValues![f.id]}&quot;
                              </p>
                            ),
                        )}
                    {signer.status !== "signed" &&
                      !!signingRequest.fields?.some(
                        (f) => f.signerId === signer.id,
                      ) && (
                        <p className="text-xs text-subtle">
                          {
                            signingRequest.fields.filter(
                              (f) => f.signerId === signer.id,
                            ).length
                          }{" "}
                          field(s) placed for them
                        </p>
                      )}
                    {signer.status === "declined" && (
                      <p className="text-xs text-subtle">
                        Declined at {signer.declinedAt}
                        {signer.declineReason
                          ? `: ${signer.declineReason}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={statusTone(signer.status)}>
                      {signer.status}
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
    </div>
  );
}
