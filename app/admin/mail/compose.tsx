"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Paperclip, X } from "lucide-react";
import { Sheet, type SheetCloseReason } from "@/components/ui/sheet";
import { announce } from "@/lib/announce";
import { COARSE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ask, isAskOpen } from "../ask";
import {
  clearDraft,
  draftKey,
  flushDraft,
  isStoredDraft,
  saveDraft,
} from "./draft-store";
import { Editor, insertQuote, syncEmpty } from "./editor";
import { FormatBar, useFormatting } from "./format-bar";
import { toPlainText } from "./html";
import {
  RecipientInput,
  type Contact,
  type RecipientInputHandle,
} from "./recipient-input";

type Upload = { blobId: string; name: string; type: string; size: number };

export type Draft = {
  to?: string[];
  cc?: string[];
  subject?: string;
  /** The user's own body html (restored drafts); '' for new messages and replies. */
  html?: string;
  /** True while page.tsx is still building the quote. */
  quoting?: boolean;
  /** The reply/forward block. May arrive after Compose opened; it is inserted once. */
  quoteHtml?: string;
  mode?: "new" | "reply" | "replyall" | "fwd";
  /** Uploaded attachments (restored drafts; blob ids are best-effort). */
  files?: Upload[];
};

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Set once the upload finished. */
  blobId?: string;
  /** 0..1 while uploading. */
  progress: number;
  /** Came back with a restored draft: the blob may have expired. */
  restored?: boolean;
};

type ComposeError = { message: string; field?: "to" | "cc" };

const looksLikeAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const fallbackTitle = (mode: Draft["mode"]) =>
  mode === "fwd"
    ? "Forward"
    : mode === "reply" || mode === "replyall"
      ? "Reply"
      : "New message";

/**
 * Phone rows: RecipientInput draws its own boxed field; the row is the box
 * there. Its input may also sit narrower, so it stays beside a chip.
 */
const BARE_FIELD =
  "phone:[&_input]:min-w-20 phone:[&>div>div:first-child]:-mx-1 phone:[&>div>div:first-child]:border-0 phone:[&>div>div:first-child]:px-0 phone:[&>div>div:first-child]:py-1";

let uploadSeq = 0;

/**
 * The compose screen. Always mounted by page.tsx; `open` drives it (the
 * close invariant, spec D4). Its fields seed from `draft` each time it opens.
 *
 * Close reasons (spec D22): Cancel / × / Discard and Esc on a fine pointer
 * run the discard flow (confirm when touched) → onDiscard. Back on a coarse
 * pointer (Android back, iPad Esc) and a forced close keep the draft →
 * onKeep. Compose clears or flushes the draft store before calling either.
 */
export function Compose({
  open,
  from,
  contacts,
  draft,
  onDiscard,
  onKeep,
  onSent,
}: {
  open: boolean;
  from: string | null;
  contacts: Contact[];
  /** Non-null whenever open. */
  draft: Draft | null;
  onDiscard: () => void;
  onKeep: () => void;
  onSent: () => void;
}) {
  // One session per opening, so the fields reseed from the draft.
  const [session, setSession] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession(session + 1);
  }
  if (session === 0) return null;

  return (
    <ComposeSheet
      key={session}
      open={open}
      from={from}
      contacts={contacts}
      draft={draft}
      onDiscard={onDiscard}
      onKeep={onKeep}
      onSent={onSent}
    />
  );
}

function ComposeSheet({
  open,
  from,
  contacts,
  draft,
  onDiscard,
  onKeep,
  onSent,
}: {
  open: boolean;
  from: string | null;
  contacts: Contact[];
  draft: Draft | null;
  onDiscard: () => void;
  onKeep: () => void;
  onSent: () => void;
}) {
  const key = draftKey(from);
  // Mount-time snapshot: the editor must never re-read live draft state.
  const [seed] = useState<Draft>(() => draft ?? {});
  const mode = seed.mode ?? "new";

  const [to, setTo] = useState<string[]>(seed.to ?? []);
  const [cc, setCc] = useState<string[]>(seed.cc ?? []);
  const [showCc, setShowCc] = useState((seed.cc ?? []).length > 0);
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(() =>
    (seed.files ?? []).map((file) => ({
      ...file,
      id: `restored-${file.blobId}`,
      progress: 1,
      restored: true,
    })),
  );
  const [batch, setBatch] = useState({ total: 0, done: 0 });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ComposeError | null>(null);
  // A restored draft counts as touched: Cancel confirms and Back keeps it.
  // Only the stored draft itself: a fresh compose that happens to share its
  // empty subject and body must not start saving over it.
  const [touched, setTouched] = useState(() => isStoredDraft(key, seed));
  const [focusTo] = useState(() => (seed.to ?? []).length === 0);

  const editorRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<RecipientInputHandle>(null);
  const ccRef = useRef<RecipientInputHandle>(null);
  const toRowRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const uploads = useRef(new Map<string, XMLHttpRequest>());
  const quoteDone = useRef(false);
  // Set once a discard is confirmed or the message is sent. The store is
  // cleared then, and nothing this still-mounted, closing sheet does later
  // (aborted uploads re-render it) may write the draft back.
  const finished = useRef(false);
  const subjectId = useId();

  // Latest values for handlers that run after an await or from the Sheet.
  const live = useRef({ to, cc, subject, attachments, touched, sending });
  useLayoutEffect(() => {
    live.current = { to, cc, subject, attachments, touched, sending };
  });

  const snapshot = useCallback((): Draft => {
    const state = live.current;
    const files = state.attachments.flatMap(({ blobId, name, type, size }) =>
      blobId ? [{ blobId, name, type, size }] : [],
    );
    return {
      to: state.to,
      cc: state.cc,
      subject: state.subject,
      html: editorRef.current?.innerHTML ?? "",
      mode,
      ...(files.length ? { files } : {}),
    };
  }, [mode]);

  const persist = useCallback(() => {
    if (live.current.touched && !finished.current) saveDraft(key, snapshot());
  }, [key, snapshot]);

  const markTouched = useCallback(() => {
    live.current.touched = true;
    setTouched(true);
  }, []);

  const formatting = useFormatting(editorRef, () => {
    markTouched();
    persist();
  });

  // Autosave the fields (the editor saves from its own input events).
  useEffect(() => {
    if (touched && open && !finished.current) saveDraft(key, snapshot());
  }, [touched, open, to, cc, subject, attachments, key, snapshot]);

  // Focus: the Sheet has already focused To or the editor (child effects run
  // first). A reply types above the quote, so the caret goes to the top.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || document.activeElement !== el) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  // The quote lands once, whenever page.tsx finishes building it.
  const quoteHtml = draft?.quoteHtml;
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (quoteHtml === undefined || quoteDone.current || !el) return;
    quoteDone.current = true;
    insertQuote(el, quoteHtml);
    persist();
  }, [quoteHtml, persist]);
  const quoting = Boolean(draft?.quoting) && quoteHtml === undefined;

  // Leaving the page with a touched draft: save it now, and ask first.
  const guard = open && (touched || attachments.length > 0);
  useEffect(() => {
    if (!guard) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (finished.current) return;
      saveDraft(key, snapshot());
      flushDraft();
      event.preventDefault();
      event.returnValue = "";
    };
    const onPageHide = () => {
      if (finished.current) return;
      saveDraft(key, snapshot());
      flushDraft();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [guard, key, snapshot]);

  // Closing (or unmounting) abandons uploads still in flight.
  useEffect(() => {
    const inFlight = uploads.current;
    if (!open) {
      for (const xhr of inFlight.values()) xhr.abort();
    }
    return () => {
      for (const xhr of inFlight.values()) xhr.abort();
    };
  }, [open]);

  const inFlight = attachments.filter((file) => !file.blobId).length;
  const uploadingLabel =
    batch.total > 1
      ? `Uploading ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…`
      : "Uploading…";

  const updateAttachment = (id: string, patch: Partial<Attachment>) =>
    setAttachments((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    );
  const dropAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((file) => file.id !== id));

  const attach = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    markTouched();
    setError(null);
    setBatch((current) =>
      live.current.attachments.some((file) => !file.blobId)
        ? { ...current, total: current.total + files.length }
        : { total: files.length, done: 0 },
    );
    for (const file of files) {
      uploadSeq += 1;
      const id = `upload-${uploadSeq}`;
      const xhr = new XMLHttpRequest();
      uploads.current.set(id, xhr);
      setAttachments((prev) => [
        ...prev,
        {
          id,
          name: file.name || "attachment",
          type: file.type,
          size: file.size,
          progress: 0,
        },
      ]);
      const settle = () => {
        uploads.current.delete(id);
        setBatch((current) => ({ ...current, done: current.done + 1 }));
      };
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0)
          updateAttachment(id, { progress: event.loaded / event.total });
      };
      xhr.onload = () => {
        settle();
        let data: (Upload & { error?: string }) | null = null;
        try {
          data = JSON.parse(xhr.responseText) as Upload & { error?: string };
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data?.blobId) {
          updateAttachment(id, {
            blobId: data.blobId,
            name: data.name,
            type: data.type,
            size: data.size,
            progress: 1,
          });
          return;
        }
        dropAttachment(id);
        setError({
          message: `${file.name}: ${data?.error ?? "Could not attach that."}`,
        });
      };
      xhr.onerror = () => {
        settle();
        dropAttachment(id);
        setError({ message: `${file.name}: Could not attach that.` });
      };
      xhr.onabort = () => {
        settle();
        dropAttachment(id);
      };
      const form = new FormData();
      form.append("file", file);
      xhr.open("POST", "/api/mail/upload");
      xhr.send(form);
    }
  };

  const removeAttachment = (file: Attachment) => {
    markTouched();
    const xhr = uploads.current.get(file.id);
    if (xhr) xhr.abort();
    else dropAttachment(file.id);
  };

  const fail = (next: ComposeError) => {
    setError(next);
    requestAnimationFrame(() => {
      if (next.field === "cc") ccRef.current?.focus();
      else if (next.field === "to") toRef.current?.focus();
    });
  };

  const send = async () => {
    if (live.current.sending) return;
    if (inFlight > 0) {
      announce("Wait for attachments to finish uploading", "assertive");
      return;
    }
    setError(null);
    const toList = toRef.current?.commit() ?? to;
    const ccList = (showCc ? ccRef.current?.commit() : undefined) ?? cc;
    if (toList.length === 0) {
      fail({ message: "Add at least one recipient.", field: "to" });
      return;
    }
    const badTo = toList.some((email) => !looksLikeAddress(email));
    const badCc = ccList.some((email) => !looksLikeAddress(email));
    if (badTo || badCc) {
      if (badCc) setShowCc(true);
      fail({
        message: "Fix the highlighted address.",
        field: badTo ? "to" : "cc",
      });
      return;
    }

    const el = editorRef.current;
    const html = el && !el.hasAttribute("data-empty") ? el.innerHTML : "";
    const text = el ? toPlainText(el) : "";
    live.current.sending = true;
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toList,
          cc: ccList,
          subject: live.current.subject,
          text,
          html: html || undefined,
          attachments: attachments.flatMap(({ blobId, type, name }) =>
            blobId ? [{ blobId, type, name }] : [],
          ),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        // Restored attachments point at blobs that may have expired: drop
        // them so the next try can go through, and say which.
        const stale = attachments.filter((file) => file.restored);
        if (res.status >= 500 && stale.length > 0) {
          setAttachments((prev) => prev.filter((file) => !file.restored));
          throw new Error(
            `Could not send with the restored attachments (${stale
              .map((file) => file.name)
              .join(", ")}), so they were removed. Attach them again.`,
          );
        }
        throw new Error(body.error ?? "Could not send this message.");
      }
      finished.current = true;
      clearDraft(key);
      onSent();
    } catch (err) {
      fail({
        message: err instanceof Error ? err.message : "Could not send.",
      });
    } finally {
      live.current.sending = false;
      setSending(false);
    }
  };

  const discard = async () => {
    if (live.current.touched || live.current.attachments.length > 0) {
      const confirmed = await ask({
        title: "Discard this draft?",
        detail: "It won't be saved.",
        confirmLabel: "Discard",
        destructive: true,
      });
      if (confirmed === null) return;
      clearDraft(key);
    }
    // Untouched, this sheet never saved: a draft stored before it opened (for
    // another message) is not its to clear.
    finished.current = true;
    onDiscard();
  };

  const keep = () => {
    if (live.current.touched) {
      saveDraft(key, snapshot());
      flushDraft();
    }
    onKeep();
  };

  const onClose = (reason: SheetCloseReason) => {
    if (live.current.sending) return;
    switch (reason) {
      case "close-button":
        void discard();
        return;
      case "cancel":
        // Coarse pointers: Android back and iPad Esc are "go back", which
        // keeps the draft. A desk Esc is an explicit dismissal.
        if (mediaMatches(COARSE_QUERY)) keep();
        else if (!isAskOpen()) void discard();
        return;
      case "forced":
        keep();
        return;
      case "backdrop":
        // The old overlay ignored backdrop clicks; a stray click must not
        // throw a message away.
        return;
    }
  };

  const expandCc = () => {
    setShowCc(true);
    requestAnimationFrame(() => ccRef.current?.focus());
  };

  const onFieldChange =
    (setter: (next: string[]) => void) => (next: string[]) => {
      setter(next);
      markTouched();
      setError((current) => (current?.field ? null : current));
    };

  // Sheet takes an element ref; the To field's input lives inside RecipientInput.
  const toFocus = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return toRowRef.current?.querySelector("input") ?? null;
      },
    }),
    [],
  );

  const fallback = fallbackTitle(mode);
  const liveSubject = subject.trim();
  const title = liveSubject || fallback;
  const uploading = inFlight > 0;

  const chip = (file: Attachment, phone: boolean) => {
    const pending = !file.blobId;
    const percent = Math.round(file.progress * 100);
    return (
      <li
        key={file.id}
        title={file.name}
        className={
          phone
            ? "relative flex min-h-11 max-w-[16rem] shrink-0 items-center gap-1.5 overflow-hidden rounded-[10px] border-2 border-line bg-raised pr-1 pl-3 text-sm font-bold text-ink"
            : "relative flex animate-pop-in items-center gap-1.5 overflow-hidden rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink"
        }
      >
        <Paperclip size={phone ? 14 : 12} aria-hidden className="shrink-0" />
        <span className={phone ? "min-w-0 truncate" : "max-w-48 truncate"}>
          {file.name}
        </span>
        {pending && (
          <>
            <span className="shrink-0 font-semibold text-subtle tabular-nums">
              {percent}%
            </span>
            <span
              role="progressbar"
              aria-label={`Uploading ${file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="absolute bottom-0 left-0 h-0.5 bg-brand transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </>
        )}
        <button
          type="button"
          aria-label={
            pending ? `Cancel uploading ${file.name}` : `Remove ${file.name}`
          }
          onClick={() => removeAttachment(file)}
          className={
            phone
              ? "relative grid size-8 shrink-0 place-items-center rounded-full text-subtle after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] active:bg-tint"
              : "text-subtle hover:text-brand"
          }
        >
          <X size={phone ? 16 : 12} aria-hidden />
        </button>
      </li>
    );
  };

  const errorText = error?.message ?? null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      hideTitle
      presentation="full"
      desktop="card"
      desktopClassName="desk:max-w-3xl"
      bare
      dismissible={!sending}
      initialFocus={focusTo ? toFocus : editorRef}
      fitVisualViewport
    >
      {/* Phone top bar: Cancel · live subject · Send. The sides split the
          spare width equally, so a short title is centred; a long one
          squeezes down to what the two buttons leave and truncates. */}
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:hidden">
        <div className="flex flex-1 basis-0 justify-start">
          <button
            type="button"
            onClick={() => onClose("close-button")}
            aria-disabled={sending || undefined}
            className="press-flat min-h-11 rounded-[10px] px-3 font-bold text-ink aria-disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <div aria-hidden className="min-w-0 shrink text-center leading-tight">
          {liveSubject && (
            <p className="truncate text-xs font-bold text-subtle">{fallback}</p>
          )}
          <p className="truncate text-base font-extrabold text-ink">{title}</p>
        </div>
        <div className="flex flex-1 basis-0 justify-end">
          <button
            type="button"
            onClick={() => void send()}
            aria-busy={sending || undefined}
            aria-disabled={uploading || undefined}
            aria-label={uploading ? uploadingLabel : undefined}
            className="press min-h-11 min-w-11 rounded-[16px] border-2 border-line bg-brand px-4 font-bold text-brand-ink shadow-brut-sm aria-disabled:opacity-60 forced-colors:border-[ButtonText]"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      {/* Desk header, as before. The sr-only <h2> above names the dialog. */}
      <header className="flex items-center justify-between border-b-2 border-line px-5 py-3 phone:hidden">
        <p aria-hidden className="text-base font-extrabold text-brand">
          {fallback}
        </p>
        <button
          type="button"
          onClick={() => onClose("close-button")}
          disabled={sending}
          aria-label="Close"
          className="px-2 text-xl leading-none text-subtle hover:text-ink disabled:opacity-50"
        >
          ×
        </button>
      </header>

      <div
        ref={scrollerRef}
        data-scroll-allow
        // Field rules are soft (as in the message list): scrolled, one can
        // stop anywhere under the top bar's heavy border without reading as
        // a second bar.
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain desk:space-y-2.5 desk:px-5 desk:py-4 phone:scroll-pb-16 phone:divide-y-2 phone:divide-line/15"
        onInput={(event) => {
          markTouched();
          if (event.target === editorRef.current) persist();
        }}
      >
        {errorText && (
          <div
            role="alert"
            className="sticky top-0 z-10 animate-rise-in border-b-2 border-line bg-tint px-4 py-2 text-sm font-bold text-ink desk:hidden"
          >
            {errorText}
          </div>
        )}

        {from && (
          <div className="flex items-center gap-2 px-1 text-sm phone:hidden">
            <span className="font-bold text-subtle">From</span>
            <span className="font-semibold text-ink">{from}</span>
          </div>
        )}

        <div
          ref={toRowRef}
          className="flex items-start gap-2 phone:min-h-12 phone:items-center phone:px-4"
        >
          <div className={cn("min-w-0 flex-1", BARE_FIELD)}>
            <RecipientInput
              ref={toRef}
              label="To"
              value={to}
              onChange={onFieldChange(setTo)}
              contacts={contacts}
              kind="address"
              validate={looksLikeAddress}
              onEnterEmpty={() => {
                if (showCc) ccRef.current?.focus();
                else document.getElementById(subjectId)?.focus();
              }}
            />
          </div>
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="rounded-[10px] border-2 border-line px-3 py-2 text-sm font-bold text-ink hover:bg-tint phone:hidden"
            >
              Cc
            </button>
          )}
        </div>

        {!showCc && (
          <button
            type="button"
            onClick={expandCc}
            className="press-flat flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm desk:hidden"
          >
            <span className="shrink-0 font-bold text-subtle">
              {from ? "Cc, From:" : "Cc"}
            </span>
            {from && (
              <span className="min-w-0 truncate font-semibold text-ink">
                {from}
              </span>
            )}
          </button>
        )}

        {showCc && (
          <div className="phone:flex phone:min-h-12 phone:items-center phone:px-4">
            <div className={cn("min-w-0 flex-1", BARE_FIELD)}>
              <RecipientInput
                ref={ccRef}
                label="Cc"
                value={cc}
                onChange={onFieldChange(setCc)}
                contacts={contacts}
                kind="address"
                validate={looksLikeAddress}
                onEnterEmpty={() => document.getElementById(subjectId)?.focus()}
              />
            </div>
          </div>
        )}

        {showCc && from && (
          <div className="flex min-h-12 items-center gap-2 px-4 text-sm desk:hidden">
            <span className="shrink-0 font-bold text-subtle">From</span>
            <span className="min-w-0 truncate font-semibold text-ink">
              {from}
            </span>
          </div>
        )}

        <div className="phone:flex phone:min-h-12 phone:items-center phone:px-4">
          <label htmlFor={subjectId} className="sr-only">
            Subject
          </label>
          <input
            id={subjectId}
            className="w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none phone:min-h-11 phone:rounded-none phone:border-0 phone:px-0 phone:py-0"
            placeholder="Subject"
            value={subject}
            enterKeyHint="next"
            onChange={(event) => setSubject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              const el = editorRef.current;
              if (!el) return;
              el.focus();
              syncEmpty(el);
            }}
          />
        </div>

        {attachments.length > 0 && (
          <ul
            aria-label="Attachments"
            className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-2 desk:hidden"
          >
            {attachments.map((file) => chip(file, true))}
          </ul>
        )}

        <Editor
          editorRef={editorRef}
          initialHtml={seed.html ?? ""}
          formatting={formatting}
          quoting={quoting}
        />

        {attachments.length > 0 && (
          <ul
            aria-label="Attachments"
            className="flex flex-wrap gap-2 phone:hidden"
          >
            {attachments.map((file) => chip(file, false))}
          </ul>
        )}

        {errorText && (
          <p
            role="alert"
            className="animate-rise-in text-sm font-bold text-brand phone:hidden"
          >
            {errorText}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t-2 border-line px-5 py-3 phone:hidden">
        <label className="cursor-pointer rounded-[10px] border-2 border-line px-3 py-2 text-sm font-bold text-ink hover:bg-tint has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-brand">
          <Paperclip size={15} className="inline" aria-hidden />
          <span className="ml-1.5">{uploading ? "Uploading…" : "Attach"}</span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              attach(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <div className="ml-auto flex gap-3">
          <button
            type="button"
            onClick={() => onClose("close-button")}
            disabled={sending}
            className="rounded-[10px] border-2 border-line px-4 py-2 font-bold text-ink hover:bg-tint disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || uploading}
            aria-busy={sending || undefined}
            className="rounded-[10px] border-2 border-line bg-brand px-5 py-2 font-bold text-brand-ink shadow-brut-sm hover:opacity-90 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </footer>

      <FormatBar
        variant="phone"
        formatting={formatting}
        onAttach={attach}
        attachLabel={uploading ? uploadingLabel : "Attach files"}
      />
    </Sheet>
  );
}
