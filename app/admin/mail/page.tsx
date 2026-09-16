"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Eye,
  Forward as ForwardIcon,
  MailOpen,
  Reply as ReplyIcon,
  ReplyAll as ReplyAllIcon,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { logout } from "@/lib/api";
import type { MailDeletionRequest } from "@/lib/api/types";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { useSession } from "../session";
import { useHandoff, usePalette } from "../palette";
import { Allowance } from "./allowance";
import { InboxPicker, useInboxes, withAs } from "./inbox-picker";
import { MailboxList } from "./mailbox-list";
import { MessageList } from "./message-list";
import { Conversation } from "./message-view";
import { Compose, type Draft } from "./compose";
import { domainOf } from "./external";
import { buildQuote } from "./html";
import { ask } from "../ask";
import type { Contact } from "./recipient-input";
import Link from "next/link";

const PAGE = 50;

type Page = {
  messages: MessageSummary[];
  total: number;
  threadCounts: Record<string, number>;
};

const EMPTY: Page = { messages: [], total: 0, threadCounts: {} };

const otherRecipients = (message: MessageSummary, self: string | null) =>
  (message.to ?? [])
    .map((address) => address.email)
    .filter((email) => email !== self && email !== message.from?.[0]?.email);

const KEYWORDS = { seen: "$seen", flagged: "$flagged" } as const;

type Flags = Partial<Record<keyof typeof KEYWORDS, boolean>>;

const withKeywords = (message: MessageSummary, flags: Flags) => {
  const next = { ...message.keywords };
  for (const [name, on] of Object.entries(flags)) {
    const keyword = KEYWORDS[name as keyof typeof KEYWORDS];
    if (on) next[keyword] = true;
    else delete next[keyword];
  }
  return { ...message, keywords: next };
};

const BUTTON =
  "rounded-[10px] border-2 border-line bg-brand px-4 py-2 font-bold text-brand-ink shadow-brut-sm hover:opacity-90";

export default function Page() {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-subtle">Loading mail…</p>}
    >
      <Scoped />
    </Suspense>
  );
}

/** Mounts MailPage afresh per inbox. */
function Scoped() {
  const { user } = useSession();
  const params = useSearchParams();
  const viewing = (user?.isMailAdmin && params.get("as")) || null;
  const inboxes = useInboxes();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const wantedRef = useRef<MessageSummary | null>(null);

  const { load } = inboxes;
  const openPicker = useCallback(() => {
    setPicking(true);
    load();
  }, [load]);

  useHandoff(
    "compose",
    useCallback(() => setDraft({}), []),
  );
  useHandoff("pickInbox", openPicker);

  return (
    <MailPage
      key={viewing ?? ""}
      viewing={viewing}
      inboxes={inboxes}
      picking={picking}
      openPicker={openPicker}
      closePicker={() => setPicking(false)}
      draft={draft}
      setDraft={setDraft}
      wantedRef={wantedRef}
    />
  );
}

function MailPage({
  viewing,
  inboxes: { inboxes, failed, load: loadInboxes },
  picking,
  openPicker,
  closePicker,
  draft,
  setDraft,
  wantedRef,
}: {
  viewing: string | null;
  inboxes: ReturnType<typeof useInboxes>;
  picking: boolean;
  openPicker: () => void;
  closePicker: () => void;
  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  wantedRef: React.RefObject<MessageSummary | null>;
}) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(EMPTY);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [from, setFrom] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [found, setFound] = useState<MessageSummary | null>(null);
  const [deletions, setDeletions] = useState<MailDeletionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [expired, setExpired] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const router = useRouter();
  const { user, refresh } = useSession();
  const { open: openPalette, isOpen: palette } = usePalette();

  const view = useCallback(
    (username: string | null) =>
      router.replace(withAs("/admin/mail", username), { scroll: false }),
    [router],
  );

  const loadMailboxes = useCallback(
    () =>
      fetch(withAs("/api/mail/mailboxes", viewing))
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((boxes: Mailbox[]) => {
          setMailboxes(boxes);
          setMailbox((current) => current ?? boxes[0]?.id ?? null);
          return boxes;
        }),
    [viewing],
  );

  const settleDeletions = useCallback(
    () =>
      fetch("/api/mail/deletions", { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: { requests: MailDeletionRequest[]; deleted: number } | null,
          ) => {
            if (!data) return;
            setDeletions(data.requests);
            if (data.deleted) {
              setSelected(null);
              setReload((count) => count + 1);
              void loadMailboxes().catch(() => {});
            }
          },
        )
        .catch(() => {}),
    [loadMailboxes],
  );

  const reveal = useCallback((hit: MessageSummary, boxes: Mailbox[]) => {
    const box = boxes.find((item) => hit.mailboxIds?.[item.id]);
    if (box) setMailbox(box.id);
    setFound(hit);
    setSelected(hit.id);
  }, []);

  useEffect(() => {
    if (viewing) loadInboxes();
    loadMailboxes()
      .then((boxes) => {
        if (wantedRef.current) reveal(wantedRef.current, boxes);
        wantedRef.current = null;
      })
      .catch((status) =>
        viewing
          ? setMissing(true)
          : status === 401
            ? setExpired(true)
            : setError("Could not reach the mail server."),
      )
      .finally(() => setLoading(false));
  }, [loadInboxes, loadMailboxes, reveal, viewing, wantedRef]);

  useEffect(() => {
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : { email: null }))
      .then((data: { email: string | null }) => setFrom(data.email))
      .catch(() => setFrom(null));

    fetch("/api/mail/contacts")
      .then((res) => (res.ok ? res.json() : []))
      .then(setContacts)
      .catch(() => setContacts([]));

    void settleDeletions();
  }, [settleDeletions]);

  const load = useCallback(
    async (position: number) => {
      if (!mailbox) return;
      const ticket = ++request.current;
      setBusy(true);
      const params = new URLSearchParams({
        mailbox,
        limit: String(PAGE),
        position: String(position),
        threaded: "1",
      });

      try {
        const res = await fetch(
          withAs(`/api/mail/messages?${params}`, viewing),
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Page;
        if (ticket !== request.current) return;
        setError(null);
        setPage((prev) =>
          position === 0
            ? data
            : {
                messages: [...prev.messages, ...data.messages],
                total: data.total,
                threadCounts: {
                  ...prev.threadCounts,
                  ...data.threadCounts,
                },
              },
        );
      } catch {
        if (ticket === request.current) setError("Could not load messages.");
      } finally {
        if (ticket === request.current) setBusy(false);
      }
    },
    [mailbox, viewing],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(0));
    return () => clearTimeout(timer);
  }, [load, reload]);

  const { messages, total, threadCounts } = page;
  const message =
    messages.find((item) => item.id === selected) ??
    (found?.id === selected ? found : null);
  const open = Boolean(message);
  const ownDomain = domainOf(from);

  const mark = useCallback((id: string, flags: Flags) => {
    setPage((prev) => ({
      ...prev,
      messages: prev.messages.map((item) =>
        item.id === id ? withKeywords(item, flags) : item,
      ),
    }));
  }, []);

  const flag = useCallback(
    async (id: string, flags: Flags) => {
      mark(id, flags);
      await fetch(`/api/mail/messages/${encodeURIComponent(id)}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flags),
      }).catch(() => null);
      if ("seen" in flags) void loadMailboxes().catch(() => {});
    },
    [mark, loadMailboxes],
  );

  const move = useCallback(
    async (id: string, to: { to?: string; mailboxId?: string }) => {
      setBusy(true);
      const res = await fetch(
        `/api/mail/messages/${encodeURIComponent(id)}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(to),
        },
      ).catch(() => null);
      setBusy(false);
      if (!res?.ok) return;
      setSelected(null);
      setReload((count) => count + 1);
      void loadMailboxes().catch(() => {});
    },
    [loadMailboxes],
  );

  const toggleChecked = useCallback((id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllChecked = useCallback(
    (on: boolean) =>
      setChecked(on ? new Set(messages.map((item) => item.id)) : new Set()),
    [messages],
  );

  const clearChecked = useCallback(() => setChecked(new Set()), []);

  const bulkFlag = useCallback(
    async (ids: string[], flags: Flags) => {
      setPage((prev) => ({
        ...prev,
        messages: prev.messages.map((item) =>
          ids.includes(item.id) ? withKeywords(item, flags) : item,
        ),
      }));
      await fetch("/api/mail/messages/bulk/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...flags }),
      }).catch(() => null);
      if ("seen" in flags) void loadMailboxes().catch(() => {});
    },
    [loadMailboxes],
  );

  const bulkMove = useCallback(
    async (ids: string[], to: { to?: string; mailboxId?: string }) => {
      setBusy(true);
      const res = await fetch("/api/mail/messages/bulk/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...to }),
      }).catch(() => null);
      setBusy(false);
      if (!res?.ok) return;
      clearChecked();
      setSelected(null);
      setReload((count) => count + 1);
      void loadMailboxes().catch(() => {});
    },
    [clearChecked, loadMailboxes],
  );

  const startDraft = useCallback(() => setDraft({}), [setDraft]);

  const showMessage = useCallback(
    (hit: MessageSummary) => {
      if (!viewing) return reveal(hit, mailboxes);
      wantedRef.current = hit;
      view(null);
    },
    [mailboxes, reveal, viewing, view, wantedRef],
  );

  useHandoff("message", showMessage);

  const requestPurge = useCallback(
    async (id: string) => {
      const reason = await ask({
        title: "Request permanent deletion",
        detail:
          "A co-president has to approve this before the message is destroyed. Say why it should go.",
        placeholder: "Reason",
        confirmLabel: "Request deletion",
        destructive: true,
        withInput: true,
        required: true,
      });
      if (reason === null) return;
      setNotice(null);
      setBusy(true);
      const res = await fetch(
        `/api/mail/messages/${encodeURIComponent(id)}/purge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      ).catch(() => null);
      setBusy(false);
      const data = (await res?.json().catch(() => null)) as {
        purged?: number;
        error?: string;
      } | null;

      if (!res?.ok) {
        setNotice({
          id,
          text: data?.error ?? "Could not ask for that deletion.",
        });
        return;
      }
      if (data?.purged !== undefined) {
        setSelected(null);
        setReload((count) => count + 1);
        void loadMailboxes().catch(() => {});
        return;
      }
      setNotice({
        id,
        text: "Asked a co-president to approve it. Nothing is gone yet.",
      });
      void settleDeletions();
    },
    [loadMailboxes, settleDeletions],
  );

  const quoteInto = useCallback(
    (target: MessageSummary, base: Draft) => {
      void buildQuote(target).then((html) => setDraft({ ...base, html }));
    },
    [setDraft],
  );

  const replyTo = useCallback(
    (target: MessageSummary, all: boolean) => {
      const sender = target.from?.[0]?.email;
      const others = otherRecipients(target, from);
      quoteInto(target, {
        to: sender ? [sender] : [],
        ...(all && others.length ? { cc: others } : {}),
        subject: prefixed(target.subject, "Re:"),
      });
    },
    [from, quoteInto],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (palette || draft || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }
      if (viewing && ["e", "#", "r", "s"].includes(event.key)) return;

      const step = (delta: number) => {
        const index = messages.findIndex((item) => item.id === selected);
        const next =
          messages[
            index === -1
              ? 0
              : Math.min(Math.max(index + delta, 0), messages.length - 1)
          ];
        if (!next) return;
        setSelected(next.id);
        document
          .querySelector(`[data-message="${CSS.escape(next.id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      };

      switch (event.key) {
        case "j":
          step(1);
          break;
        case "k":
          step(-1);
          break;
        case "/":
          event.preventDefault();
          openPalette();
          break;
        case "e":
          if (selected) void move(selected, { to: "archive" });
          break;
        case "#":
          if (selected) void move(selected, { to: "trash" });
          break;
        case "r":
          if (message) replyTo(message, false);
          break;
        case "s":
          if (message)
            void flag(message.id, { flagged: !message.keywords?.$flagged });
          break;
        case "u":
        case "Escape":
          setSelected(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    draft,
    palette,
    openPalette,
    messages,
    selected,
    message,
    move,
    flag,
    replyTo,
    viewing,
  ]);

  if (loading) {
    return <p className="p-6 text-sm text-subtle">Loading mail…</p>;
  }
  if (expired) {
    return (
      <div className="m-4 animate-rise-in rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut">
        <p className="font-bold text-brand">Your mail session expired.</p>
        <p className="mt-2 max-w-prose text-sm text-subtle">
          Mail signs in to the mail server on your behalf, and that sign-in
          lapses after 30 minutes of inactivity. Signing in again reconnects it.
        </p>
        <button
          type="button"
          onClick={async () => {
            await logout();
            await refresh();
          }}
          className={`mt-5 ${BUTTON}`}
        >
          Sign in again
        </button>
      </div>
    );
  }
  if (missing) {
    return (
      <div className="m-4 animate-rise-in rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut">
        <p className="font-bold text-brand">
          No such inbox, or you may not read it.
        </p>
        <button
          type="button"
          onClick={() => view(null)}
          className={`mt-5 ${BUTTON}`}
        >
          Back to your inbox
        </button>
      </div>
    );
  }

  const current = mailboxes.find((box) => box.id === mailbox);
  const shown: { name: string; address?: string } | null = viewing
    ? (inboxes?.find((inbox) => inbox.username === viewing) ?? {
        name: viewing,
      })
    : null;

  return (
    <div className="flex h-[calc(100dvh-3.625rem-3.5rem)] animate-fade-in flex-col gap-3 p-3 md:h-[calc(100dvh-3.625rem)] md:gap-4 md:p-4 lg:flex-row">
      <aside
        className={`min-h-0 w-full shrink-0 flex-col gap-3 lg:flex lg:w-52 lg:shrink-0 ${open ? "hidden" : "flex"}`}
      >
        {user?.isMailAdmin && (
          <InboxPicker
            inboxes={inboxes}
            failed={failed}
            self={from}
            viewing={shown}
            open={picking}
            onOpen={openPicker}
            onClose={closePicker}
            onPick={view}
          />
        )}
        {!viewing && (
          <button
            type="button"
            onClick={startDraft}
            className="shrink-0 rounded-[10px] border-2 border-line bg-brand px-4 py-2.5 font-bold text-brand-ink shadow-brut-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            Compose
          </button>
        )}
        <MailboxList
          mailboxes={mailboxes}
          selected={mailbox}
          onSelect={(id) => {
            setSelected(null);
            setChecked(new Set());
            setMailbox(id);
          }}
        />
        {!viewing && (
          <>
            <Allowance refresh={reload} />
            <Link
              className="shrink-0 rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-center text-xs font-bold text-ink hover:bg-tint"
              href="/admin/mail/setup"
            >
              Set up on your phone
            </Link>
          </>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border-2 border-line bg-surface shadow-brut">
        {shown && (
          <div
            role="status"
            className="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-line bg-tint px-4 py-2.5 text-sm"
          >
            <Eye size={15} className="shrink-0 text-brand" aria-hidden />
            <p className="min-w-0 flex-1 font-semibold text-ink">
              Reading {shown.name}&rsquo;s inbox
              {shown.address && ` (${shown.address})`} as an administrator.{" "}
              <span className="text-subtle">
                Read-only — opening a message here does not mark it as read for
                them.
              </span>
            </p>
            <button
              type="button"
              onClick={() => view(null)}
              className="shrink-0 rounded-[8px] border-2 border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink hover:bg-raised"
            >
              Back to your inbox
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div
            className={`min-h-0 w-full flex-col lg:flex lg:w-80 lg:shrink-0 lg:border-r-2 lg:border-line ${open ? "hidden" : "flex"}`}
          >
            <header className="shrink-0 space-y-2 border-b-2 border-line px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="truncate text-sm font-extrabold text-ink">
                  {current?.name ?? "Mail"}
                </h2>
                <p className="shrink-0 text-xs text-subtle">
                  {messages.length} of {total}
                </p>
              </div>
              <button
                type="button"
                onClick={openPalette}
                className="flex w-full items-center gap-2 rounded-[8px] border-2 border-line bg-surface px-2 py-1 text-sm text-subtle hover:bg-tint"
              >
                <Search size={14} aria-hidden />
                <span className="flex-1 text-left">Search everything</span>
                <kbd className="rounded-[6px] border-2 border-line px-1 text-[10px] font-bold text-ink">
                  ⌘K
                </kbd>
              </button>
            </header>

            {!viewing && checked.size > 0 && (
              <BulkActions
                busy={busy}
                count={checked.size}
                onArchive={() => void bulkMove([...checked], { to: "archive" })}
                onClear={clearChecked}
                onMarkRead={() => void bulkFlag([...checked], { seen: true })}
                onMarkUnread={() =>
                  void bulkFlag([...checked], { seen: false })
                }
                onStar={() => void bulkFlag([...checked], { flagged: true })}
                onTrash={() => void bulkMove([...checked], { to: "trash" })}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {error ? (
                <p className="px-4 py-10 text-center text-sm font-bold text-brand">
                  {error}
                </p>
              ) : (
                <MessageList
                  key={mailbox}
                  checked={checked}
                  messages={messages}
                  onCheck={viewing ? undefined : toggleChecked}
                  onCheckAll={viewing ? undefined : toggleAllChecked}
                  onSelect={setSelected}
                  ownDomain={ownDomain}
                  selected={selected}
                  threadCounts={threadCounts}
                  onFlag={
                    viewing
                      ? undefined
                      : (item, flagged) => void flag(item.id, { flagged })
                  }
                />
              )}
              {messages.length < total && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void load(messages.length)}
                  className="w-full border-t-2 border-line px-4 py-3 text-sm font-bold text-brand hover:bg-tint disabled:opacity-50"
                >
                  {busy
                    ? "Loading…"
                    : `Load ${Math.min(PAGE, total - messages.length)} more`}
                </button>
              )}
            </div>
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 flex-col ${open ? "flex" : "hidden lg:flex"}`}
          >
            {message ? (
              <>
                <MessageActions
                  message={message}
                  mailboxes={mailboxes}
                  busy={busy}
                  viewing={Boolean(viewing)}
                  replyAll={otherRecipients(message, from).length > 0}
                  onBack={() => setSelected(null)}
                  onReply={(all) => replyTo(message, all)}
                  onForward={() =>
                    quoteInto(message, {
                      subject: prefixed(message.subject, "Fwd:"),
                    })
                  }
                  onFlag={(flags) => void flag(message.id, flags)}
                  onUnread={() => {
                    void flag(message.id, { seen: false });
                    setSelected(null);
                  }}
                  onMove={(to) => void move(message.id, to)}
                  inTrash={
                    mailboxes.find((box) => box.id === mailbox)?.role ===
                    "trash"
                  }
                  deletionPending={deletions.some(
                    (request) =>
                      (request.status === "pending" ||
                        request.status === "approved") &&
                      request.messageIds.includes(message.id),
                  )}
                  onPurge={() => void requestPurge(message.id)}
                />
                {notice?.id === message.id && (
                  <p className="shrink-0 animate-rise-in border-b-2 border-line bg-tint px-5 py-2 text-sm font-bold text-ink">
                    {notice.text}
                  </p>
                )}
                <h2 className="shrink-0 border-b-2 border-line px-5 py-3 text-lg font-extrabold text-brand">
                  {message.subject || "(no subject)"}
                </h2>
                <Conversation
                  key={message.id}
                  message={message}
                  count={threadCounts[message.threadId] ?? 1}
                  ownDomain={ownDomain}
                  viewing={viewing}
                  onRead={(id) => {
                    mark(id, { seen: true });
                    void loadMailboxes().catch(() => {});
                  }}
                />
              </>
            ) : (
              <p className="p-6 text-sm text-subtle">
                Select a message to read it. Shortcuts: j/k move,{" "}
                {viewing ? "" : "r reply, e archive, # delete, "}/ search.
              </p>
            )}
          </div>
        </div>
      </div>

      {draft && (
        <Compose
          from={from}
          contacts={contacts}
          initial={draft}
          onClose={() => setDraft(null)}
          onSent={() => {
            setDraft(null);
            setReload((count) => count + 1);
          }}
        />
      )}
    </div>
  );
}

const prefixed = (subject: string | null, prefix: string) =>
  subject?.toLowerCase().startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject ?? ""}`.trim();

const ACTION =
  "rounded-[8px] border-2 border-line px-2.5 py-1.5 text-sm font-bold text-ink hover:bg-tint disabled:opacity-50";

/** Replaces per-message actions once more than one message is checked. */
function BulkActions({
  count,
  busy,
  onMarkRead,
  onMarkUnread,
  onStar,
  onArchive,
  onTrash,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onStar: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b-2 border-line bg-tint px-4 py-2">
      <p className="mr-1 text-sm font-bold text-ink">{count} selected</p>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onMarkRead}
      >
        Mark read
      </button>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onMarkUnread}
      >
        Mark unread
      </button>
      <button type="button" className={ACTION} disabled={busy} onClick={onStar}>
        Star
      </button>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onArchive}
      >
        Archive
      </button>
      <button
        type="button"
        className={`${ACTION} text-brand`}
        disabled={busy}
        onClick={onTrash}
      >
        Delete
      </button>
      <button
        type="button"
        className={`${ACTION} ml-auto`}
        onClick={onClear}
        aria-label="Clear selection"
      >
        Clear
      </button>
    </div>
  );
}

function MessageActions({
  message,
  mailboxes,
  busy,
  viewing,
  replyAll,
  onBack,
  onReply,
  onForward,
  onFlag,
  onUnread,
  onMove,
  inTrash,
  deletionPending,
  onPurge,
}: {
  message: MessageSummary;
  mailboxes: Mailbox[];
  busy: boolean;
  viewing: boolean;
  replyAll: boolean;
  onBack: () => void;
  onReply: (all: boolean) => void;
  onForward: () => void;
  onFlag: (flags: Flags) => void;
  onUnread: () => void;
  onMove: (to: { to?: string; mailboxId?: string }) => void;
  inTrash: boolean;
  deletionPending: boolean;
  onPurge: () => void;
}) {
  const flagged = Boolean(message.keywords?.$flagged);
  const unread = !message.keywords?.$seen;
  const inArchive = mailboxes.some(
    (box) => box.role === "archive" && message.mailboxIds?.[box.id],
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 border-b-2 border-line px-3 py-2.5 lg:px-5 ${viewing ? "lg:hidden" : ""}`}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the list"
        className={`${ACTION} lg:hidden`}
      >
        <ArrowLeft size={15} aria-hidden />
      </button>
      {!viewing && (
        <>
          <button
            type="button"
            aria-label="Reply"
            className={`${ACTION} flex items-center gap-1.5`}
            onClick={() => onReply(false)}
          >
            <ReplyIcon size={15} aria-hidden />
            <span className="hidden sm:inline">Reply</span>
          </button>
          {replyAll && (
            <button
              type="button"
              aria-label="Reply all"
              className={`${ACTION} flex items-center gap-1.5`}
              onClick={() => onReply(true)}
            >
              <ReplyAllIcon size={15} aria-hidden />
              <span className="hidden sm:inline">Reply all</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Forward"
            className={`${ACTION} flex items-center gap-1.5`}
            onClick={onForward}
          >
            <ForwardIcon size={15} aria-hidden />
            <span className="hidden sm:inline">Forward</span>
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label={flagged ? "Remove star" : "Star"}
              aria-pressed={flagged}
              className={ACTION}
              onClick={() => onFlag({ flagged: !flagged })}
            >
              <Star
                size={15}
                className={`transition-colors duration-[var(--dur-fast)] ease-smooth ${flagged ? "fill-brand text-brand" : "fill-transparent"}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              aria-label="Mark unread"
              disabled={unread}
              title={unread ? "Already unread" : "Mark unread"}
              className={ACTION}
              onClick={onUnread}
            >
              <MailOpen size={15} aria-hidden />
            </button>
            <select
              aria-label="Move to folder"
              value=""
              disabled={busy}
              onChange={(event) =>
                event.target.value && onMove({ mailboxId: event.target.value })
              }
              className={`${ACTION} max-w-32 bg-surface`}
            >
              <option value="">Move to…</option>
              {mailboxes
                .filter((box) => !message.mailboxIds?.[box.id])
                .map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              aria-label="Archive"
              disabled={busy || inArchive}
              title={inArchive ? "Already in the archive" : undefined}
              className={`${ACTION} flex items-center gap-1.5`}
              onClick={() => onMove({ to: "archive" })}
            >
              <Archive size={15} aria-hidden />
              <span className="hidden sm:inline">Archive</span>
            </button>
            {inTrash ? (
              deletionPending ? (
                <span className="rounded-[8px] border-2 border-line bg-tint px-2.5 py-1.5 text-sm font-bold text-ink">
                  Waiting on a co-president
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Request deletion"
                  disabled={busy}
                  className={`${ACTION} flex items-center gap-1.5 text-destructive`}
                  onClick={onPurge}
                >
                  <Trash2 size={15} aria-hidden />
                  <span className="hidden sm:inline">Request deletion</span>
                </button>
              )
            ) : (
              <button
                type="button"
                aria-label="Delete"
                disabled={busy}
                className={`${ACTION} flex items-center gap-1.5 text-brand`}
                onClick={() => onMove({ to: "trash" })}
              >
                <Trash2 size={15} aria-hidden />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
