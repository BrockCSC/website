"use client";

import { Ban, Check, Clock, Download, PenLine } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  consentToSign,
  declineToSign,
  fetchSignerSession,
  memberSignerBase,
  submitSignature,
  tokenSignerBase,
} from "@/lib/api/signing";
import type {
  SignResult,
  SignerSessionView,
  SigningField,
} from "@/lib/api/types";
import { ActionBar } from "./action-bar";
import { AdoptSignatureModal } from "./adopt-signature-modal";
import {
  byDocumentOrder,
  needsSignerAction,
  type AdoptedDraft,
} from "./adopted";
import { CompletedDocuments } from "./completed-documents";
import { ConsentCard } from "./consent-card";
import { DeclineDialog } from "./decline-dialog";
import { DocumentPages } from "./document-pages";
import { BrandMark, EnvelopeHeader, cardClass } from "./envelope-header";
import { FieldTag } from "./field-tag";

type Variant = "public" | "portal";

const errorText = (err: unknown, fallback: string) =>
  (err instanceof ApiError && err.detail) || fallback;

const formatWhen = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

function Notice({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Check;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-[14px] border-2 border-line bg-tint p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface text-brand">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-subtle">{children}</p>
      </div>
    </div>
  );
}

/** What to tell a signer who has nothing left to do, or null when they can sign. */
const closedState = (session: SignerSessionView) => {
  const { signer, requestStatus, completed } = session;
  if (signer.status === "declined") {
    return {
      icon: Ban,
      title: "You declined to sign",
      detail: "The sender has been told. There's nothing more to do.",
    };
  }
  if (signer.status === "signed" && requestStatus === "completed") {
    return {
      icon: Check,
      title: "Everyone has signed",
      detail: completed
        ? `You signed on ${formatWhen(signer.signedAt)}. The completed document and its certificate are below.`
        : `You signed on ${formatWhen(signer.signedAt)}. We emailed you a link to the completed document and its certificate.`,
    };
  }
  if (signer.status === "signed" && requestStatus === "sent") {
    return {
      icon: Check,
      title: "You've signed",
      detail: `You signed on ${formatWhen(signer.signedAt)}. Other people still need to sign, and we'll email you when everyone has.`,
    };
  }
  if (requestStatus === "cancelled") {
    return {
      icon: Ban,
      title: "This request was cancelled",
      detail: "The sender cancelled it, so it can't be signed any more.",
    };
  }
  if (requestStatus === "declined") {
    return {
      icon: Ban,
      title: "This request is closed",
      detail: "Someone declined to sign, so it can't be signed any more.",
    };
  }
  if (requestStatus === "completed") {
    return {
      icon: Check,
      title: "This document is complete",
      detail: "The completed document and its certificate are below.",
    };
  }
  if (!session.canSign) {
    return {
      icon: Clock,
      title: "It isn't your turn yet",
      detail:
        session.waitingReason ??
        "Someone else needs to sign first. We'll email you when it's your turn.",
    };
  }
  return null;
};

function SigningFlow({
  base,
  variant,
  onChanged,
  hideCompletedFiles = false,
}: {
  base: string;
  variant: Variant;
  onChanged?: () => void;
  hideCompletedFiles?: boolean;
}) {
  const heading = variant === "public" ? "h1" : "h2";
  const idPrefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);

  const [session, setSession] = useState<SignerSessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notSigner, setNotSigner] = useState(false);

  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [adopted, setAdopted] = useState<AdoptedDraft | null>(null);
  const [stamped, setStamped] = useState<ReadonlySet<string>>(new Set());
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [adoptFor, setAdoptFor] = useState<{
    fieldId?: string;
    finish?: boolean;
  } | null>(null);
  const [started, setStarted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchSignerSession(base);
        if (!cancelled) setSession(view);
      } catch (err) {
        if (cancelled) return;
        if (
          variant === "portal" &&
          err instanceof ApiError &&
          err.status === 404
        ) {
          setNotSigner(true);
        } else {
          setLoadError(
            errorText(
              err,
              variant === "public"
                ? "This signing link is invalid or has expired."
                : "Could not load your signing request.",
            ),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, variant]);

  const fields = useMemo(
    () => [...(session?.fields ?? [])].sort(byDocumentOrder),
    [session],
  );
  const required = fields.filter(needsSignerAction);
  const isDone = (field: SigningField) =>
    field.type === "text"
      ? !!textValues[field.id]?.trim()
      : !!adopted && stamped.has(field.id);
  const doneCount = required.filter(isDone).length;
  const domId = (fieldId: string) => `${idPrefix}-field-${fieldId}`;

  const consented = !!(consentedAt ?? session?.signer.consentedAt);
  const closed = session && !declined ? closedState(session) : null;
  const phase = !session
    ? "loading"
    : result
      ? "done"
      : declined
        ? "declined"
        : closed
          ? "closed"
          : consented
            ? "sign"
            : "consent";

  const lastPhase = useRef(phase);
  useEffect(() => {
    const previous = lastPhase.current;
    if (previous === phase) return;
    lastPhase.current = phase;
    if (previous === "loading") return;
    // The control that moved us on has unmounted; land keyboard and screen-reader users on the new heading.
    root.current
      ?.querySelector<HTMLElement>("[data-flow-heading]")
      ?.focus({ preventScroll: true });
    root.current?.scrollIntoView({ block: "start" });
  }, [phase]);

  const focusField = (fieldId: string) =>
    requestAnimationFrame(() =>
      document.getElementById(domId(fieldId))?.focus({ preventScroll: true }),
    );

  const goToNext = () => {
    setStarted(true);
    const next = required.find((field) => !isDone(field));
    if (!next) return;
    const el = document.getElementById(domId(next.id));
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    el.focus({ preventScroll: true });
    if (reduce) return;
    el.closest("[data-field-id]")?.firstElementChild?.animate(
      [{ scale: "1" }, { scale: "1.14" }, { scale: "1" }],
      { duration: 520, iterations: 3, easing: "ease-in-out" },
    );
  };

  const stamp = (fieldId: string) => {
    setStamped((prev) => new Set(prev).add(fieldId));
    setStarted(true);
    focusField(fieldId);
  };

  const submit = async (draft: AdoptedDraft | null) => {
    if (!draft) {
      setAdoptFor({ finish: true });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fieldValues: Record<string, string> = {};
      for (const field of fields) {
        const value = textValues[field.id]?.trim();
        if (field.type === "text" && value) fieldValues[field.id] = value;
      }
      const signed = await submitSignature(base, {
        adopted: draft,
        fieldValues,
      });
      setResult(signed);
      onChangedRef.current?.();
    } catch (err) {
      setSubmitError(errorText(err, "Could not finish signing. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const adopt = (draft: AdoptedDraft) => {
    const pending = adoptFor;
    setAdopted(draft);
    setAdoptFor(null);
    if (pending?.fieldId) stamp(pending.fieldId);
    if (pending?.finish) void submit(draft);
  };

  const consent = async () => {
    setConsentBusy(true);
    setConsentError(null);
    try {
      const response = await consentToSign(base);
      setConsentedAt(response.consentedAt);
      onChangedRef.current?.();
    } catch (err) {
      setConsentError(errorText(err, "Could not record your agreement."));
    } finally {
      setConsentBusy(false);
    }
  };

  const decline = async (reason: string) => {
    setDeclineBusy(true);
    setDeclineError(null);
    try {
      await declineToSign(base, reason || undefined);
      setDeclineOpen(false);
      setDeclined(true);
      onChangedRef.current?.();
    } catch (err) {
      setDeclineError(errorText(err, "Could not record that. Try again."));
    } finally {
      setDeclineBusy(false);
    }
  };

  // Most people opening a request in the portal aren't signers on it; don't flash a card at them.
  if (notSigner || (variant === "portal" && !session && !loadError)) {
    return null;
  }

  const header = session && (
    <EnvelopeHeader
      documentTitle={session.documentTitle}
      envelopeId={session.envelopeId}
      from={session.requesterName}
      heading={heading}
      title={session.requestTitle}
    />
  );

  const Heading = heading;
  const content = (() => {
    if (loadError) {
      return (
        <div className={cardClass}>
          <BrandMark />
          <Heading className="mt-4 text-2xl font-extrabold text-brand">
            {variant === "public" ? "This link doesn't work" : "Your signature"}
          </Heading>
          <p className="mt-2 text-sm text-subtle" role="alert">
            {loadError}
          </p>
        </div>
      );
    }
    if (!session) {
      return (
        <div className={`${cardClass} animate-pulse`}>
          <BrandMark />
          <p className="mt-4 text-sm font-bold text-subtle">Loading...</p>
        </div>
      );
    }

    if (result) {
      return (
        <>
          <div className={cardClass}>
            <BrandMark />
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-12 shrink-0 animate-pop-in items-center justify-center rounded-full border-2 border-line bg-brand text-brand-ink shadow-brut-sm">
                <Check aria-hidden className="size-6" />
              </span>
              <Heading
                className="text-2xl font-extrabold text-brand focus:outline-none"
                data-flow-heading
                tabIndex={-1}
              >
                You&apos;re done signing
              </Heading>
            </div>
            <p className="mt-3 text-ink">
              {result.completed
                ? "Everyone has signed. The completed document and its Certificate of Completion are below."
                : "Other people still need to sign this document. We'll email you when everyone has signed."}
            </p>
            <p className="mt-2 font-mono text-[11px] break-all text-subtle">
              Envelope ID: {session.envelopeId}
            </p>
          </div>
          {result.completed && !hideCompletedFiles && (
            <CompletedDocuments
              certificateUrl={result.completed.certificateUrl}
              signedFileUrl={result.completed.signedFileUrl}
            />
          )}
        </>
      );
    }

    if (declined || closed) {
      const notice = declined
        ? {
            icon: Ban,
            title: "You declined to sign",
            detail: "The sender has been told. There's nothing more to do.",
          }
        : closed!;
      return (
        <>
          <div className={cardClass}>
            {header}
            <Notice icon={notice.icon} title={notice.title}>
              {notice.detail}
            </Notice>
          </div>
          {!declined && session.completed && !hideCompletedFiles && (
            <CompletedDocuments
              certificateUrl={session.completed.certificateUrl}
              signedFileUrl={session.completed.signedFileUrl}
            />
          )}
        </>
      );
    }

    if (!consented) {
      return (
        <ConsentCard
          busy={consentBusy}
          error={consentError}
          heading={heading}
          onContinue={() => void consent()}
          onDecline={() => setDeclineOpen(true)}
          session={session}
        />
      );
    }

    return (
      <>
        <div className={cardClass}>
          {header}
          <p className="mt-4 flex items-start gap-2 text-sm text-ink">
            <PenLine
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-brand"
            />
            {required.length ? (
              <span>
                Select <strong>Start</strong> to jump to your first field.
                Select each Sign and Initial tag, fill in any text boxes, then
                select <strong>Finish</strong>.
              </span>
            ) : (
              <span>
                Review the document, then select <strong>Finish</strong> to
                adopt your signature and sign.
              </span>
            )}
          </p>
        </div>

        <div>
          <ActionBar
            busy={submitting}
            done={doneCount}
            error={submitError}
            menuItems={[
              ...(adopted
                ? [
                    {
                      label: "Change signature",
                      onSelect: () => setAdoptFor({}),
                    },
                  ]
                : []),
              {
                label: "Decline to sign",
                onSelect: () => setDeclineOpen(true),
                destructive: true,
              },
            ]}
            onFinish={() => void submit(adopted)}
            onNext={goToNext}
            started={started}
            total={required.length}
          />
          <div className="mt-4 rounded-[20px] border-2 border-line bg-raised p-2 sm:p-6">
            <DocumentPages
              fileUrl={session.fileUrl}
              key={session.fileUrl}
              label="Document to sign"
              overlay={(page, scale) =>
                fields
                  .filter((field) => field.page === page)
                  .map((field) => (
                    <FieldTag
                      adopted={adopted}
                      disabled={submitting}
                      domId={domId(field.id)}
                      field={field}
                      key={field.id}
                      onChangeSignature={() => setAdoptFor({})}
                      onSign={() =>
                        adopted
                          ? stamp(field.id)
                          : setAdoptFor({ fieldId: field.id })
                      }
                      onTextChange={(value) =>
                        setTextValues((prev) => ({
                          ...prev,
                          [field.id]: value,
                        }))
                      }
                      scale={scale}
                      stamped={stamped.has(field.id)}
                      textValue={textValues[field.id] ?? ""}
                    />
                  ))
              }
            />
          </div>
          <a
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-subtle underline underline-offset-4 hover:text-ink"
            download
            href={session.fileUrl}
          >
            <Download aria-hidden className="size-3.5" />
            Download a copy
          </a>
        </div>
      </>
    );
  })();

  return (
    <div
      className={`flex scroll-mt-4 flex-col gap-5 ${variant === "public" ? "py-8 sm:py-10" : ""}`}
      ref={root}
    >
      {content}
      {adoptFor && session && (
        <AdoptSignatureModal
          current={adopted}
          defaultName={session.signer.name ?? ""}
          onAdopt={adopt}
          onClose={() => setAdoptFor(null)}
        />
      )}
      {declineOpen && (
        <DeclineDialog
          busy={declineBusy}
          error={declineError}
          onClose={() => setDeclineOpen(false)}
          onConfirm={(reason) => void decline(reason)}
        />
      )}
    </div>
  );
}

/** The external signer's page, reached from the emailed /sign/<token> link. */
export function TokenSigningFlow({ token }: { token: string }) {
  return <SigningFlow base={tokenSignerBase(token)} variant="public" />;
}

/** A member signing inside the portal; renders nothing if they aren't a signer on this request. */
export function MemberSigningPanel({
  signingRequestId,
  onChanged,
  hideCompletedFiles,
}: {
  signingRequestId: string;
  onChanged: () => void;
  /** The exec view already lists the completed files in its own panel. */
  hideCompletedFiles?: boolean;
}) {
  return (
    <SigningFlow
      base={memberSignerBase(signingRequestId)}
      hideCompletedFiles={hideCompletedFiles}
      onChanged={onChanged}
      variant="portal"
    />
  );
}
