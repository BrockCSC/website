"use client";

import {
  Ban,
  Check,
  Clock,
  Download,
  Info,
  PenLine,
  RotateCw,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { announce } from "@/lib/announce";
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
import { SIGNING_FIELD_DEFAULT_LABEL } from "@/lib/documents/fields";
import {
  COARSE_QUERY,
  mediaMatches,
  useCoarsePointer,
  usePhone,
} from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ActionBar, SignBottomBar } from "./action-bar";
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
import { EnvelopeDetailsSheet, TextFieldSheet } from "./field-sheets";
import { FieldTag } from "./field-tag";
import { clearProgress, readProgress, writeProgress } from "./progress";

type Variant = "public" | "portal";

const errorText = (err: unknown, fallback: string) =>
  (err instanceof ApiError && err.detail) || fallback;

/** A 4xx means the link itself is bad; anything else (network, 5xx) may pass. */
const isLinkError = (err: unknown) =>
  err instanceof ApiError && err.status >= 400 && err.status < 500;

const formatWhen = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fieldLabel = (field: SigningField) =>
  field.label?.trim() || SIGNING_FIELD_DEFAULT_LABEL[field.type];

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
        <p className="mt-0.5 text-[15px] text-subtle sm:text-sm">{children}</p>
      </div>
    </div>
  );
}

/** Placeholder while the session loads. */
export function SigningSkeleton({ brandless }: { brandless?: boolean }) {
  return (
    <div aria-busy className={cardClass}>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <BrandMark className={brandless ? "phone:hidden" : undefined} />
      <div aria-hidden className="animate-pulse">
        <span
          className={cn(
            "mt-4 block h-7 w-3/4 rounded-[8px] bg-raised",
            brandless && "phone:mt-0",
          )}
        />
        <span className="mt-3 block h-4 w-1/3 rounded-full bg-raised" />
        <span className="mt-6 block h-4 w-full rounded-full bg-raised" />
        <span className="mt-2 block h-4 w-5/6 rounded-full bg-raised" />
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

type LoadError = { kind: "link" | "network"; message: string };

function SigningFlow({
  base,
  variant,
  storageKey,
  onChanged,
  hideCompletedFiles = false,
}: {
  base: string;
  variant: Variant;
  /** sessionStorage key for progress (adopted mark, stamps, typed text). */
  storageKey: string;
  onChanged?: () => void;
  hideCompletedFiles?: boolean;
}) {
  const heading = variant === "public" ? "h1" : "h2";
  const isPublic = variant === "public";
  const idPrefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);
  const phone = usePhone();
  const coarse = useCoarsePointer();

  const [session, setSession] = useState<SignerSessionView | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [notSigner, setNotSigner] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

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
  const [docReady, setDocReady] = useState(false);
  // A primary tap before the document was laid out: run it once it is.
  const pendingNext = useRef(false);
  // Progress is only written back once it has been read.
  const restored = useRef(false);

  const [textSheet, setTextSheet] = useState<{
    fieldId: string;
    open: boolean;
  } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        if (cancelled) return;
        setLoadError(null);
        setSession(view);
        if (closedState(view)) {
          clearProgress(storageKey);
        } else {
          const saved = readProgress(storageKey);
          if (saved) {
            const ids = new Set(view.fields.map((field) => field.id));
            const stampedIds = (saved.stamped ?? []).filter((id) =>
              ids.has(id),
            );
            const texts = Object.fromEntries(
              Object.entries(saved.textValues ?? {}).filter(([id]) =>
                ids.has(id),
              ),
            );
            setAdopted(saved.adopted ?? null);
            setStamped(new Set(saved.adopted ? stampedIds : []));
            setTextValues(texts);
            if (stampedIds.length || Object.keys(texts).length) {
              setStarted(true);
            }
          }
        }
        restored.current = true;
      } catch (err) {
        if (cancelled) return;
        if (
          variant === "portal" &&
          err instanceof ApiError &&
          err.status === 404
        ) {
          setNotSigner(true);
        } else if (isLinkError(err) || variant === "portal") {
          setLoadError({
            kind: "link",
            message: errorText(
              err,
              isPublic
                ? "This link is invalid or has expired. Ask the sender to send it again."
                : "Could not load your signing request.",
            ),
          });
        } else {
          setLoadError({
            kind: "network",
            message:
              "Check your connection, then try again. Your link is still good.",
          });
        }
      } finally {
        if (!cancelled) setRetrying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, base, isPublic, storageKey, variant]);

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
  const nextField = required.find((field) => !isDone(field));
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
  const bottomBar = isPublic && phone && phase === "sign";

  useEffect(() => {
    if (!restored.current || phase !== "sign") return;
    writeProgress(storageKey, {
      adopted,
      stamped: [...stamped],
      textValues,
    });
  }, [adopted, phase, stamped, storageKey, textValues]);

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
    // After consent, the document is what's next, not the header card.
    const target =
      previous === "consent" && phase === "sign"
        ? documentRef.current
        : root.current;
    target?.scrollIntoView({ block: "start" });
  }, [phase]);

  const fieldVisual = (fieldId: string) =>
    root.current?.querySelector(`[data-field-id="${CSS.escape(fieldId)}"]`)
      ?.firstElementChild ?? null;

  const pulse = (fieldId: string) => {
    if (reducedMotion()) return;
    fieldVisual(fieldId)?.animate(
      [{ scale: "1" }, { scale: "1.14" }, { scale: "1" }],
      { duration: 520, iterations: 3, easing: "ease-in-out" },
    );
  };

  /** Scrolls a field to the middle of the screen. False if it isn't laid out yet. */
  const scrollToField = (fieldId: string) => {
    const el = document.getElementById(domId(fieldId));
    if (!el) return false;
    const behavior = reducedMotion() ? "auto" : "smooth";
    const bar = document.querySelector("[data-sign-bottom-bar]");
    if (!bar) {
      el.scrollIntoView({ block: "center", behavior });
      return true;
    }
    // Centre it in the room above the phone sign bar, not the whole screen.
    const rect = el.getBoundingClientRect();
    const room = window.innerHeight - bar.getBoundingClientRect().height;
    window.scrollTo({
      top: window.scrollY + rect.top + rect.height / 2 - room / 2,
      behavior,
    });
    return true;
  };

  /** Desk Start/Next, and a blocked Finish: jump to the next field without acting on it. */
  const goToNext = () => {
    if (!nextField) return;
    if (!scrollToField(nextField.id)) {
      if (!docReady) pendingNext.current = true;
      return;
    }
    setStarted(true);
    // Keyboard flows only: on touch, focusing a text field raises the keyboard.
    if (!mediaMatches(COARSE_QUERY)) {
      document
        .getElementById(domId(nextField.id))
        ?.focus({ preventScroll: true });
    }
    pulse(nextField.id);
  };
  const goToNextRef = useRef(goToNext);
  useLayoutEffect(() => {
    goToNextRef.current = goToNext;
  });

  /** After a stamp or a text commit: point at the next field if it's already on screen. */
  const advanceFrom = (doneId: string) => {
    const next = required.find(
      (field) => field.id !== doneId && !isDone(field),
    );
    if (!next) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(domId(next.id));
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const bottom =
        window.innerHeight -
        (document.documentElement.hasAttribute("data-sign-bar") ? 80 : 0);
      if (rect.bottom > 0 && rect.top < bottom) pulse(next.id);
    });
  };

  const stamp = (fieldId: string) => {
    setStamped((prev) => new Set(prev).add(fieldId));
    setStarted(true);
    // On touch, focus stays put: the tap target is still under the finger.
    if (!mediaMatches(COARSE_QUERY)) {
      requestAnimationFrame(() =>
        document.getElementById(domId(fieldId))?.focus({ preventScroll: true }),
      );
    }
    advanceFrom(fieldId);
  };

  const signField = (fieldId: string) =>
    adopted ? stamp(fieldId) : setAdoptFor({ fieldId });

  const openText = (fieldId: string) => setTextSheet({ fieldId, open: true });
  const closeText = () =>
    setTextSheet((prev) => prev && { ...prev, open: false });
  const commitText = (fieldId: string, value: string) => {
    setTextValues((prev) => ({ ...prev, [fieldId]: value }));
    closeText();
    setStarted(true);
    if (value.trim()) advanceFrom(fieldId);
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
      clearProgress(storageKey);
      setResult(signed);
      onChangedRef.current?.();
    } catch (err) {
      const message = errorText(err, "Could not finish signing. Try again.");
      setSubmitError(message);
      // The phone bar has no room for it inline.
      if (document.documentElement.hasAttribute("data-sign-bar")) {
        toast({ message, tone: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const blockedFinish = () => {
    const left = required.length - doneCount;
    announce(`${left} field${left === 1 ? "" : "s"} left`);
    goToNext();
  };

  /** The phone bar's one primary: Start, then each field in turn, then Finish. */
  const onPrimary = () => {
    if (!docReady) {
      pendingNext.current = true;
      announce("Loading the document");
      return;
    }
    if (!nextField) {
      void submit(adopted);
      return;
    }
    if (!started) {
      goToNext();
      return;
    }
    scrollToField(nextField.id);
    if (nextField.type === "text") openText(nextField.id);
    else signField(nextField.id);
  };

  const onDocReady = () => {
    setDocReady(true);
    if (!pendingNext.current) return;
    pendingNext.current = false;
    requestAnimationFrame(() => goToNextRef.current());
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
      clearProgress(storageKey);
      setDeclineOpen(false);
      setDeclined(true);
      onChangedRef.current?.();
    } catch (err) {
      setDeclineError(errorText(err, "Could not record that. Try again."));
    } finally {
      setDeclineBusy(false);
    }
  };

  const downloadCopy = () => {
    if (!session) return;
    const link = document.createElement("a");
    link.href = session.fileUrl;
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  };

  // Most people opening a request in the portal aren't signers on it; don't flash a card at them.
  if (notSigner || (variant === "portal" && !session && !loadError)) {
    return null;
  }

  const options: ActionSheetAction[] = [
    ...(adopted
      ? [
          {
            key: "change",
            label: "Change signature",
            icon: PenLine,
            onSelect: () => setAdoptFor({}),
          },
        ]
      : []),
    {
      key: "download",
      label: "Download a copy",
      icon: Download,
      onSelect: downloadCopy,
    },
    {
      key: "details",
      label: "Details",
      icon: Info,
      onSelect: () => setDetailsOpen(true),
    },
    {
      key: "decline",
      label: "Decline to sign",
      icon: Ban,
      destructive: true,
      onSelect: () => setDeclineOpen(true),
    },
  ];

  const hitLabel = (field: SigningField) => {
    const index = required.indexOf(field);
    const position =
      index >= 0 ? `field ${index + 1} of ${required.length}` : "optional";
    const who = session?.signer.name ? `, ${session.signer.name}` : "";
    if (field.type === "text") {
      const value = textValues[field.id]?.trim();
      return `${fieldLabel(field)}${value ? `: ${value}` : ""}, ${position}`;
    }
    const isSignature = field.type === "signature";
    if (adopted && stamped.has(field.id)) {
      return `${isSignature ? "Signed" : "Initialled"}, ${position}. Options`;
    }
    return `${isSignature ? "Sign" : "Initial"} here, ${position}${who}`;
  };

  const primaryLabel = !nextField
    ? "Finish"
    : !started
      ? "Start"
      : nextField.type === "signature"
        ? "Sign"
        : nextField.type === "initials"
          ? "Initial"
          : `Fill in ${fieldLabel(nextField)}`;

  const header = session && (
    <EnvelopeHeader
      brandless={isPublic}
      compact={phase === "sign" ? "sign" : undefined}
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
      const network = loadError.kind === "network";
      return (
        <div className={cardClass}>
          <BrandMark className={isPublic ? "phone:hidden" : undefined} />
          <Heading
            className={cn(
              "mt-4 text-2xl font-extrabold text-brand",
              isPublic && "phone:mt-0",
            )}
          >
            {network
              ? "Couldn't reach BrockCSC Sign"
              : isPublic
                ? "This link doesn't work"
                : "Your signature"}
          </Heading>
          <p className="mt-2 text-[15px] text-subtle sm:text-sm" role="alert">
            {loadError.message}
          </p>
          {network && (
            <Button
              aria-busy={retrying || undefined}
              className="mt-5 max-sm:h-12 max-sm:w-full"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                setAttempt((n) => n + 1);
              }}
              type="button"
              variant="outline"
            >
              <RotateCw aria-hidden />
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          )}
        </div>
      );
    }
    if (!session) return <SigningSkeleton brandless={isPublic} />;

    if (result) {
      return (
        <>
          <div className={cardClass}>
            <BrandMark className={isPublic ? "phone:hidden" : undefined} />
            <div
              className={cn(
                "mt-4 flex items-center gap-3",
                isPublic && "phone:mt-0",
              )}
            >
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
              bleed={isPublic}
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
              bleed={isPublic}
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
          brandless={isPublic}
          busy={consentBusy}
          error={consentError}
          heading={heading}
          onContinue={() => void consent()}
          onDecline={() => setDeclineOpen(true)}
          session={session}
        />
      );
    }

    const textField = textSheet
      ? fields.find((field) => field.id === textSheet.fieldId)
      : undefined;

    return (
      <>
        <div className={cardClass}>
          {header}
          <p className="mt-4 flex items-start gap-2 text-sm text-ink phone:mt-2 phone:text-[15px] short:hidden">
            <PenLine
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-brand"
            />
            {required.length ? (
              <>
                <span className="phone:hidden">
                  Select <strong>Start</strong> to jump to your first field.
                  Select each Sign and Initial tag, fill in any text boxes, then
                  select <strong>Finish</strong>.
                </span>
                <span className="desk:hidden">
                  Tap <strong>Start</strong>, then each field in turn.
                </span>
              </>
            ) : (
              <>
                <span className="phone:hidden">
                  Review the document, then select <strong>Finish</strong> to
                  adopt your signature and sign.
                </span>
                <span className="desk:hidden">
                  Review the document, then tap <strong>Finish</strong>.
                </span>
              </>
            )}
          </p>
        </div>

        <div className="scroll-mt-4" ref={documentRef}>
          <ActionBar
            busy={submitting}
            className={isPublic ? "phone:hidden" : undefined}
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
            onBlockedFinish={blockedFinish}
            onFinish={() => void submit(adopted)}
            onNext={goToNext}
            portal={!isPublic}
            started={started}
            total={required.length}
          />
          <div
            className={cn(
              "mt-4 rounded-[20px] border-2 border-line bg-raised p-2 sm:p-6",
              // Phones: the pages run edge to edge, at the largest scale the
              // screen allows.
              isPublic &&
                "phone:mt-0 short:p-3! max-sm:-mx-5 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0",
            )}
          >
            <DocumentPages
              bleed={isPublic}
              fileUrl={session.fileUrl}
              key={session.fileUrl}
              label="Document to sign"
              onReady={onDocReady}
              overlay={(page, scale) =>
                fields
                  .filter((field) => field.page === page)
                  .map((field) => (
                    <FieldTag
                      adopted={adopted}
                      coarse={coarse}
                      disabled={submitting}
                      domId={domId(field.id)}
                      field={field}
                      hitLabel={hitLabel(field)}
                      key={field.id}
                      onChangeSignature={() => setAdoptFor({})}
                      onSign={() => signField(field.id)}
                      onStampedTap={() => setOptionsOpen(true)}
                      onTextChange={(value) =>
                        setTextValues((prev) => ({
                          ...prev,
                          [field.id]: value,
                        }))
                      }
                      onTextOpen={() => openText(field.id)}
                      scale={scale}
                      stamped={stamped.has(field.id)}
                      textValue={textValues[field.id] ?? ""}
                    />
                  ))
              }
            />
          </div>
          <a
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-subtle underline underline-offset-4 hover:text-ink pointer-coarse:min-h-11",
              isPublic && "phone:hidden",
            )}
            download
            href={session.fileUrl}
          >
            <Download aria-hidden className="size-3.5" />
            Download a copy
          </a>
        </div>

        {bottomBar && (
          <SignBottomBar
            busy={submitting}
            done={doneCount}
            loading={!docReady}
            onMore={() => setOptionsOpen(true)}
            onPrimary={onPrimary}
            primaryLabel={primaryLabel}
            total={required.length}
          />
        )}
        <ActionSheet
          actions={options}
          onClose={() => setOptionsOpen(false)}
          open={optionsOpen}
          title="Options"
        />
        <EnvelopeDetailsSheet
          documentTitle={session.documentTitle}
          envelopeId={session.envelopeId}
          from={session.requesterName}
          onClose={() => setDetailsOpen(false)}
          open={detailsOpen}
          title={session.requestTitle}
        />
        {textField && textSheet && (
          <TextFieldSheet
            label={fieldLabel(textField)}
            onClose={closeText}
            onCommit={(value) => commitText(textField.id, value)}
            open={textSheet.open}
            required={textField.required}
            value={textValues[textField.id] ?? ""}
          />
        )}
      </>
    );
  })();

  return (
    <div
      className={cn(
        "flex scroll-mt-4 flex-col gap-5",
        isPublic && "py-3 desk:py-10",
        bottomBar && "pb-[calc(5rem+env(safe-area-inset-bottom))]",
      )}
      ref={root}
    >
      {content}
      {adoptFor && session && (
        <AdoptSignatureModal
          current={adopted}
          defaultName={session.signer.name ?? ""}
          onAdopt={adopt}
          onClose={() => setAdoptFor(null)}
          storageKey={storageKey}
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
  return (
    <SigningFlow
      base={tokenSignerBase(token)}
      storageKey={`sign:${token}`}
      variant="public"
    />
  );
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
      storageKey={`sign:member:${signingRequestId}`}
      variant="portal"
    />
  );
}
