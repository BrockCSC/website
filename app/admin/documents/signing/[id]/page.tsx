"use client";

import {
  Ban,
  ChevronRight,
  Copy,
  Ellipsis,
  FileText,
  RotateCw,
  UserMinus,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompletedDocuments } from "@/components/documents/completed-documents";
import { SignerSwatch } from "@/components/documents/placement-tools";
import {
  SignerActivity,
  SigningProgressBar,
  signerStatusLabel,
  signingProgress,
} from "@/components/documents/signer-activity";
import { MemberSigningPanel } from "@/components/documents/signing/signing-flow";
import { SigningTimeline } from "@/components/documents/signing-timeline";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
  type SafeSigner,
  type SigningRequestItem,
} from "@/lib/api/documents";
import { fetchSignerSession, memberSignerBase } from "@/lib/api/signing";
import type { SignerSessionView } from "@/lib/api/types";
import { signerColor } from "@/lib/documents/signer-colors";
import { formatSigningTime } from "@/lib/documents/signing-time";
import { usePhone } from "@/lib/use-media-query";
import { ask } from "../../../ask";
import { useTopBar } from "../../../chrome";
import { AdminPage } from "../../../page-frame";
import { useSession } from "../../../session";
import { Note, Panel, Pill, Rows, field } from "../../../users/ui";

const statusTone = (status: string) =>
  status === "signed" || status === "completed" ? "accent" : "flat";

const sectionTitle =
  "mb-2 text-sm font-extrabold tracking-wide text-ink uppercase";

const emailInputProps = {
  autoCapitalize: "off",
  autoComplete: "off",
  autoCorrect: "off",
  enterKeyHint: "done",
  inputMode: "email",
  spellCheck: false,
  type: "email",
} as const;

const sortedSigners = (request: SigningRequestItem) =>
  request.signers.slice().sort((a, b) => a.order - b.order);

export default function SigningRequestPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const { user } = useSession();
  const phone = usePhone();
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
  const [pickedMember, setPickedMember] = useState("");

  // Phones: the request's ⋯ sheet, one signer's ⋯ sheet, and the signing
  // panel, which stays collapsed until "Review & sign" is tapped.
  const [actionsOpen, setActionsOpen] = useState(false);
  const [signerSheet, setSignerSheet] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mySigner, setMySigner] = useState<SignerSessionView["signer"] | null>(
    null,
  );

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

  // Whether the viewer signs this request, for the phone call to action.
  const loadMySigner = useCallback(async () => {
    try {
      setMySigner((await fetchSignerSession(memberSignerBase(id))).signer);
    } catch {
      setMySigner(null);
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

  useEffect(() => {
    if (!user?.isExecutive || !phone) return;
    void (async () => {
      await loadMySigner();
    })();
  }, [loadMySigner, user?.isExecutive, phone]);

  const onPanelChanged = () => {
    void load();
    if (phone) void loadMySigner();
  };

  /** Phones get a toast; desk keeps its inline note. */
  const report = (message: string, tone?: "error") => {
    if (phone) toast({ message, tone });
    else if (tone) setError(message);
    else setNote(message);
  };

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    failure: string,
    success?: string,
  ) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const result = await work();
      if (result && typeof result === "object" && "pending" in result) {
        report("Submitted for a co-president to approve.");
      } else if (success) {
        if (phone) toast({ message: success });
      }
      await load();
      return true;
    } catch (err) {
      report((err instanceof ApiError && err.detail) || failure, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (signerId: string) =>
    signingRequest?.signers.find((s) => s.id === signerId)?.name ?? "Signer";

  const cancel = async () => {
    const confirmed = await ask({
      title: "Cancel this signing request?",
      detail: "Every outstanding link stops working.",
      confirmLabel: "Cancel request",
      destructive: true,
    });
    if (confirmed === null) return;
    await run(
      "cancel",
      () => cancelSigningRequest(id),
      "Could not cancel.",
      "Request cancelled",
    );
  };

  const removeSignerRow = async (signerId: string) => {
    const name = nameOf(signerId);
    const confirmed = await ask({
      title: `Remove ${name}?`,
      detail: "Their signing link stops working.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (confirmed === null) return;
    await run(
      `remove:${signerId}`,
      () => removeSigner(id, signerId),
      "Could not remove that signer.",
      "Signer removed",
    );
  };

  const resend = (signerId: string) =>
    run(
      `resend:${signerId}`,
      () => resendSignerLink(id, signerId),
      "Could not resend.",
      `Link resent to ${nameOf(signerId)}`,
    );

  const remind = async (targets: SafeSigner[]) => {
    if (targets.length === 1) {
      await resend(targets[0].id);
      return;
    }
    await run(
      "remind",
      () =>
        Promise.all(targets.map((s) => resendSignerLink(id, s.id))).then(
          () => null,
        ),
      "Could not send the reminders.",
      `Links resent to ${targets.length} signers`,
    );
  };

  const copyPortalLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/admin/documents/signing/${id}`,
      );
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Could not copy the link.", tone: "error" });
    }
  };

  // Pick, then confirm: adding someone to a live request sends them a link.
  const addMember = async () => {
    const member = members.find((m) => m.id === pickedMember);
    if (!member) return;
    const confirmed = await ask({
      title: `Add ${member.name}?`,
      detail: "They'll get a signing link.",
      confirmLabel: "Add signer",
    });
    if (confirmed === null) return;
    const added = await run(
      "add",
      () => addSigner(id, { kind: "member", signupId: member.id }),
      "Could not add that signer.",
      `${member.name} added`,
    );
    if (added) setPickedMember("");
  };

  const addExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = externalName.trim();
    if (!name || !externalEmail.trim()) return;
    await run(
      "add",
      () =>
        addSigner(id, {
          kind: "external",
          name,
          email: externalEmail.trim(),
        }),
      "Could not add that signer.",
      `${name} added`,
    );
    setExternalName("");
    setExternalEmail("");
  };

  const openPanel = () => {
    setPanelOpen(true);
    // After the panel has mounted below the call to action.
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ block: "start" }),
    );
  };

  const active = signingRequest?.status === "sent";

  useTopBar(
    {
      title: "Sign document",
      back: { label: "Home", href: "/admin" },
      largeTitle: false,
    },
    { active: !!user?.isMember && !user.isExecutive },
  );
  useTopBar(
    {
      back: document
        ? { label: "Document", href: `/admin/documents/${document.$key}` }
        : { label: "Documents", href: "/admin/documents" },
      title: signingRequest?.title ?? "Signing request",
      docTitle: signingRequest?.title,
      actions:
        document || active ? (
          <button
            aria-haspopup="dialog"
            aria-label="More actions"
            className="press-flat grid size-11 place-items-center rounded-[10px] text-ink"
            onClick={() => setActionsOpen(true)}
            type="button"
          >
            <Ellipsis aria-hidden className="size-5" strokeWidth={2.5} />
          </button>
        ) : undefined,
    },
    { active: user?.isExecutive === true },
  );

  if (!user?.isMember) {
    return (
      <AdminPage>
        <Note>Only signed-in members can see signing requests.</Note>
      </AdminPage>
    );
  }
  // A member signer with no exec role (e.g. alumni) gets only their own
  // signature panel — the rest of this page manages the request and is
  // admin-only, matching /admin/documents and /admin/documents/[id].
  if (!user.isExecutive) {
    return (
      <AdminPage>
        <MemberSigningPanel onChanged={() => {}} signingRequestId={id} />
      </AdminPage>
    );
  }
  if (loading) {
    return (
      <AdminPage>
        <p className="font-bold text-subtle">Loading...</p>
      </AdminPage>
    );
  }
  if (!signingRequest) {
    return (
      <AdminPage>
        {error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-2 border-line bg-tint p-4"
            role="alert"
          >
            <p className="font-bold text-ink">{error}</p>
            <Button
              className="min-h-11"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              type="button"
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        ) : (
          <Note>That signing request doesn&apos;t exist.</Note>
        )}
      </AdminPage>
    );
  }

  const signers = sortedSigners(signingRequest);
  const completedPanel = signingRequest.status === "completed" &&
    signingRequest.resultingVersionId && (
      <Panel
        note="A SHA-256 fingerprint changes if even one byte of its file does."
        title="Completed documents"
      >
        <CompletedDocuments request={signingRequest} />
      </Panel>
    );

  if (phone) {
    const { signed, total, waitingOn } = signingProgress(signingRequest);
    const waiting = signers.filter(
      (s) => s.status !== "signed" && s.status !== "declined",
    );
    const remindable = (
      signingRequest.mode === "ordered" ? waiting.slice(0, 1) : waiting
    ).filter((s) => s.notifiedAt);
    const canRemind = active && user.isApprover && remindable.length > 0;
    const sheetSigner = signers.find((s) => s.id === signerSheet);
    const myTurn =
      active &&
      mySigner &&
      mySigner.status !== "signed" &&
      mySigner.status !== "declined";

    const signerActions = (signer: SafeSigner): ActionSheetAction[] => [
      ...(user.isApprover && signer.notifiedAt
        ? [
            {
              key: "resend",
              label: "Resend link",
              icon: RotateCw,
              disabled: busy === `resend:${signer.id}`,
              onSelect: () => void resend(signer.id),
            },
          ]
        : []),
      ...(signer.kind === "member"
        ? [
            {
              key: "copy",
              label: "Copy link",
              icon: Copy,
              onSelect: () => void copyPortalLink(),
            },
          ]
        : []),
      {
        key: "remove",
        label: "Remove",
        icon: UserMinus,
        destructive: true,
        disabled: busy === `remove:${signer.id}`,
        onSelect: () => void removeSignerRow(signer.id),
      },
    ];

    return (
      <AdminPage className="group flex flex-col gap-6">
        <div>
          <h1 className="line-clamp-3 text-xl font-extrabold wrap-anywhere text-ink phone:group-has-[[data-signing-header]]:sr-only">
            {signingRequest.title}
          </h1>
        </div>

        <section
          aria-labelledby="status-heading"
          className="rounded-[16px] border-2 border-line bg-surface p-4"
          data-status-card
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              className="text-sm font-extrabold tracking-wide text-ink uppercase"
              id="status-heading"
            >
              Status
            </h2>
            <Pill tone={statusTone(signingRequest.status)}>
              {signingRequest.status}
            </Pill>
          </div>
          <p className="mt-3 text-base font-bold text-ink">
            {signed} of {total} signed
          </p>
          <div className="mt-2">
            <SigningProgressBar signed={signed} total={total} />
          </div>
          {active && waitingOn && (
            <p className="mt-2 text-base text-subtle">
              {signingRequest.mode === "ordered" ? "Next: " : "Waiting on "}
              <span className="font-bold text-ink">{waitingOn}</span>
            </p>
          )}
          <p className="mt-2 text-sm text-subtle">
            {signingRequest.mode === "ordered"
              ? "Signs in order"
              : "Signs in parallel"}{" "}
            · Requested by{" "}
            {signingRequest.createdByName || signingRequest.createdBy},{" "}
            {formatSigningTime(signingRequest.createdAt)}
          </p>
          {signingRequest.completedAt && (
            <p className="text-sm text-subtle">
              Completed {formatSigningTime(signingRequest.completedAt)}
            </p>
          )}
          {signingRequest.cancelledAt && (
            <p className="text-sm text-subtle">
              Cancelled {formatSigningTime(signingRequest.cancelledAt)}
            </p>
          )}
          {canRemind && (
            <Button
              className="mt-4 h-11 w-full"
              disabled={busy != null}
              onClick={() => void remind(remindable)}
              type="button"
              variant="primary"
            >
              {remindable.length === 1
                ? `Remind ${remindable[0].name ?? "signer"}`
                : `Remind ${remindable.length} signers`}
            </Button>
          )}
        </section>

        {mySigner && !panelOpen && (
          <button
            className="press flex items-center gap-3 rounded-[16px] border-2 border-line bg-surface p-4 text-left shadow-brut-sm"
            onClick={openPanel}
            type="button"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-lg font-extrabold text-ink">
                {myTurn ? "Review & sign" : "Your signature"}
              </span>
              <span className="text-sm text-subtle">
                {myTurn
                  ? "You're a signer on this request."
                  : mySigner.status === "signed"
                    ? "You signed this request."
                    : mySigner.status === "declined"
                      ? "You declined this request."
                      : "This request is no longer open."}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
          </button>
        )}

        {panelOpen && (
          <div className="scroll-mt-4" ref={panelRef}>
            <MemberSigningPanel
              hideCompletedFiles
              onChanged={onPanelChanged}
              signingRequestId={id}
            />
          </div>
        )}

        {completedPanel}

        <section aria-labelledby="signers-heading">
          <h2 className={sectionTitle} id="signers-heading">
            Signers
          </h2>
          <ul className="divide-y-2 divide-line/15 overflow-hidden rounded-[16px] border-2 border-line bg-surface">
            {signers.map((signer) => {
              const actionable = active && signer.status !== "signed";
              return (
                <li
                  className="flex items-start gap-3 py-3 pr-2 pl-4"
                  key={signer.id}
                >
                  <span className="mt-1.5">
                    <SignerSwatch color={signerColor(signer.order)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-bold wrap-anywhere text-ink">
                        {signer.name ?? "Signer"}
                      </p>
                      <Pill tone={statusTone(signer.status)}>
                        {signerStatusLabel(signer)}
                      </Pill>
                    </div>
                    <span className="block text-sm wrap-anywhere text-subtle">
                      {signer.kind === "member" ? "Member" : signer.email}
                    </span>
                    <SignerActivity request={signingRequest} signer={signer} />
                  </div>
                  {actionable && (
                    <button
                      aria-haspopup="dialog"
                      aria-label={`Actions for ${signer.name ?? "signer"}`}
                      className="press-flat grid size-11 shrink-0 place-items-center rounded-[10px] text-ink"
                      onClick={() => setSignerSheet(signer.id)}
                      type="button"
                    >
                      <Ellipsis
                        aria-hidden
                        className="size-5"
                        strokeWidth={2.5}
                      />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {active && (
          <section aria-labelledby="add-signer-heading">
            <h2 className={sectionTitle} id="add-signer-heading">
              Add a signer
            </h2>
            <div className="flex flex-col gap-3 rounded-[16px] border-2 border-line bg-surface p-4">
              <select
                aria-label="Add a member signer"
                className={field}
                onChange={(e) => setPickedMember(e.target.value)}
                value={pickedMember}
              >
                <option value="">Pick a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {pickedMember && (
                <Button
                  className="h-11 w-full"
                  disabled={busy === "add"}
                  onClick={() => void addMember()}
                  type="button"
                  variant="secondary"
                >
                  Add signer
                </Button>
              )}
              <form
                className="flex flex-col gap-3 border-t-2 border-line/15 pt-3"
                onSubmit={addExternal}
              >
                <input
                  aria-label="External signer name"
                  autoCapitalize="words"
                  autoComplete="off"
                  className={field}
                  enterKeyHint="next"
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="External signer name"
                  value={externalName}
                />
                <input
                  aria-label="External signer email"
                  className={field}
                  onChange={(e) => setExternalEmail(e.target.value)}
                  placeholder="Email"
                  value={externalEmail}
                  {...emailInputProps}
                />
                <Button
                  className="h-11 w-full"
                  disabled={
                    busy === "add" ||
                    !externalName.trim() ||
                    !externalEmail.trim()
                  }
                  type="submit"
                  variant="secondary"
                >
                  Add external signer
                </Button>
              </form>
            </div>
          </section>
        )}

        <section aria-labelledby="history-heading">
          <h2 className={sectionTitle} id="history-heading">
            History
          </h2>
          <div className="rounded-[16px] border-2 border-line bg-surface p-4">
            <SigningTimeline collapsedCount={3} request={signingRequest} />
          </div>
        </section>

        <ActionSheet
          actions={[
            ...(document
              ? [
                  {
                    key: "document",
                    label: "Open document",
                    icon: FileText,
                    onSelect: () =>
                      router.push(`/admin/documents/${document.$key}`),
                  },
                ]
              : []),
            ...(active
              ? [
                  {
                    key: "cancel",
                    label: "Cancel request",
                    icon: Ban,
                    destructive: true,
                    disabled: busy === "cancel",
                    onSelect: () => void cancel(),
                  },
                ]
              : []),
          ]}
          onClose={() => setActionsOpen(false)}
          open={actionsOpen}
          title={signingRequest.title}
        />

        <ActionSheet
          actions={sheetSigner ? signerActions(sheetSigner) : []}
          message={
            sheetSigner?.kind === "external" ? sheetSigner.email : undefined
          }
          onClose={() => setSignerSheet(null)}
          open={sheetSigner != null}
          title={sheetSigner?.name ?? "Signer"}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage className="flex flex-col gap-6">
      <div>
        {document && (
          <Link
            className="text-sm font-bold text-subtle hover:text-ink desk:pointer-coarse:inline-flex desk:pointer-coarse:min-h-11 desk:pointer-coarse:items-center"
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

      <MemberSigningPanel
        hideCompletedFiles
        onChanged={load}
        signingRequestId={id}
      />

      <Panel
        action={
          active ? (
            <Button
              className="pointer-coarse:h-11"
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

      {completedPanel}

      <Panel title="Signers">
        <ul className="flex flex-col gap-3">
          {signers.map((signer) => (
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
                          onClick={() => void resend(signer.id)}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          Resend
                        </Button>
                      )}
                      <Button
                        aria-label={`Remove ${signer.name ?? "signer"}`}
                        disabled={busy === `remove:${signer.id}`}
                        onClick={() => void removeSignerRow(signer.id)}
                        size="xs"
                        type="button"
                        variant="outline-destructive"
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
                aria-label="Add a member signer"
                className={field}
                onChange={(e) => setPickedMember(e.target.value)}
                value={pickedMember}
              >
                <option value="">Add a member signer...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {pickedMember && (
                <Button
                  className="pointer-coarse:h-11"
                  disabled={busy === "add"}
                  onClick={() => void addMember()}
                  type="button"
                  variant="secondary"
                >
                  Add signer
                </Button>
              )}
            </div>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={addExternal}
            >
              <input
                aria-label="External signer name"
                autoCapitalize="words"
                autoComplete="off"
                className={field}
                enterKeyHint="next"
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="External signer name"
                value={externalName}
              />
              <input
                aria-label="External signer email"
                className={field}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="Email"
                value={externalEmail}
                {...emailInputProps}
              />
              <Button
                className="pointer-coarse:h-11"
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
    </AdminPage>
  );
}
