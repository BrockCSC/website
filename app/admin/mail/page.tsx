"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MailOpen, Search, Star } from "lucide-react";
import { logout } from "@/lib/api";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { useSession } from "../session";
import { MailboxList } from "./mailbox-list";
import { MessageList } from "./message-list";
import { Conversation } from "./message-view";
import { Compose, type Draft } from "./compose";
import { SearchPalette } from "./search-palette";
import { buildQuote } from "./html";
import type { Contact } from "./recipient-input";

const PAGE = 50;

type Page = {
  messages: MessageSummary[];
  total: number;
  threadCounts: Record<string, number>;
};

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

export default function MailPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [page, setPage] = useState<Page>({
    messages: [],
    total: 0,
    threadCounts: {},
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [palette, setPalette] = useState(false);
  const [found, setFound] = useState<MessageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const { refresh } = useSession();

  const loadMailboxes = useCallback(
    () =>
      fetch("/api/mail/mailboxes")
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((boxes: Mailbox[]) => {
          setMailboxes(boxes);
          setMailbox((current) => current ?? boxes[0]?.id ?? null);
        }),
    [],
  );

  useEffect(() => {
    loadMailboxes()
      .catch((status) =>
        status === 401
          ? setExpired(true)
          : setError("Could not reach the mail server."),
      )
      .finally(() => setLoading(false));

    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : { email: null }))
      .then((data: { email: string | null }) => setFrom(data.email))
      .catch(() => setFrom(null));

    fetch("/api/mail/contacts")
      .then((res) => (res.ok ? res.json() : []))
      .then(setContacts)
      .catch(() => setContacts([]));

    fetch("/api/mail/trash", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { purged: number } | null) => {
        if (data?.purged) void loadMailboxes().catch(() => {});
      })
      .catch(() => {});
  }, [loadMailboxes]);

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
        const res = await fetch(`/api/mail/messages?${params}`);
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
    [mailbox],
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

  const closePalette = useCallback(() => setPalette(false), []);

  const purge = useCallback(
    async (id: string) => {
      if (
        !window.confirm("Delete this message forever? This cannot be undone.")
      )
        return;
      setBusy(true);
      const res = await fetch(
        `/api/mail/messages/${encodeURIComponent(id)}/purge`,
        { method: "POST" },
      ).catch(() => null);
      setBusy(false);
      if (!res?.ok) return;
      setSelected(null);
      setReload((count) => count + 1);
      void loadMailboxes().catch(() => {});
    },
    [loadMailboxes],
  );

  const quoteInto = useCallback((target: MessageSummary, base: Draft) => {
    void buildQuote(target).then((html) => setDraft({ ...base, html }));
  }, []);

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
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
          setPalette(true);
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
  }, [draft, palette, messages, selected, message, move, flag, replyTo]);

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
          className="mt-5 rounded-[10px] border-2 border-line bg-brand px-4 py-2 font-bold text-brand-ink shadow-brut-sm hover:opacity-90"
        >
          Sign in again
        </button>
      </div>
    );
  }

  const current = mailboxes.find((box) => box.id === mailbox);

  return (
    <div className="flex h-[calc(100dvh-3.625rem)] animate-fade-in gap-3 p-3 md:gap-4 md:p-4">
      <aside
        className={`min-h-0 shrink-0 flex-col gap-3 md:flex md:w-52 ${open ? "hidden" : "flex"}`}
      >
        <button
          type="button"
          onClick={() => setDraft({})}
          className="shrink-0 rounded-[10px] border-2 border-line bg-brand px-4 py-2.5 font-bold text-brand-ink shadow-brut-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
        >
          Compose
        </button>
        <MailboxList
          mailboxes={mailboxes}
          selected={mailbox}
          onSelect={(id) => {
            setSelected(null);
            setMailbox(id);
          }}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[20px] border-2 border-line bg-surface shadow-brut">
        <div
          className={`min-h-0 w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r-2 md:border-line ${open ? "hidden" : "flex"}`}
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
              onClick={() => setPalette(true)}
              className="flex w-full items-center gap-2 rounded-[8px] border-2 border-line bg-surface px-2 py-1 text-sm text-subtle hover:bg-tint"
            >
              <Search size={14} aria-hidden />
              <span className="flex-1 text-left">Search all mail</span>
              <kbd className="rounded-[6px] border-2 border-line px-1 text-[10px] font-bold text-ink">
                ⌘K
              </kbd>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <p className="px-4 py-10 text-center text-sm font-bold text-brand">
                {error}
              </p>
            ) : (
              <MessageList
                key={mailbox}
                messages={messages}
                selected={selected}
                threadCounts={threadCounts}
                onSelect={setSelected}
                onFlag={(item, flagged) => void flag(item.id, { flagged })}
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
          className={`min-h-0 min-w-0 flex-1 flex-col ${open ? "flex" : "hidden md:flex"}`}
        >
          {message ? (
            <>
              <MessageActions
                message={message}
                mailboxes={mailboxes}
                busy={busy}
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
                  mailboxes.find((box) => box.id === mailbox)?.role === "trash"
                }
                onPurge={() => void purge(message.id)}
              />
              <h2 className="shrink-0 border-b-2 border-line px-5 py-3 text-lg font-extrabold text-brand">
                {message.subject || "(no subject)"}
              </h2>
              <Conversation
                key={message.id}
                message={message}
                count={threadCounts[message.threadId] ?? 1}
                onRead={(id) => {
                  mark(id, { seen: true });
                  void loadMailboxes().catch(() => {});
                }}
              />
            </>
          ) : (
            <p className="p-6 text-sm text-subtle">
              Select a message to read it. Shortcuts: j/k move, r reply, e
              archive, # delete, / search.
            </p>
          )}
        </div>
      </div>

      {palette && (
        <SearchPalette
          mailboxes={mailboxes}
          contacts={contacts}
          onClose={closePalette}
          onOpen={(hit) => {
            const box = mailboxes.find((item) => hit.mailboxIds?.[item.id]);
            if (box) setMailbox(box.id);
            setFound(hit);
            setSelected(hit.id);
          }}
        />
      )}

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

function MessageActions({
  message,
  mailboxes,
  busy,
  replyAll,
  onBack,
  onReply,
  onForward,
  onFlag,
  onUnread,
  onMove,
  inTrash,
  onPurge,
}: {
  message: MessageSummary;
  mailboxes: Mailbox[];
  busy: boolean;
  replyAll: boolean;
  onBack: () => void;
  onReply: (all: boolean) => void;
  onForward: () => void;
  onFlag: (flags: Flags) => void;
  onUnread: () => void;
  onMove: (to: { to?: string; mailboxId?: string }) => void;
  inTrash: boolean;
  onPurge: () => void;
}) {
  const flagged = Boolean(message.keywords?.$flagged);

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-line px-3 py-2.5 md:px-5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the list"
        className={`${ACTION} md:hidden`}
      >
        <ArrowLeft size={15} aria-hidden />
      </button>
      <button type="button" className={ACTION} onClick={() => onReply(false)}>
        Reply
      </button>
      {replyAll && (
        <button type="button" className={ACTION} onClick={() => onReply(true)}>
          Reply all
        </button>
      )}
      <button type="button" className={ACTION} onClick={onForward}>
        Forward
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
          title="Mark unread"
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
          disabled={busy}
          className={ACTION}
          onClick={() => onMove({ to: "archive" })}
        >
          Archive
        </button>
        {inTrash ? (
          <button
            type="button"
            disabled={busy}
            className={`${ACTION} text-destructive`}
            onClick={onPurge}
          >
            Delete forever
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={`${ACTION} text-brand`}
            onClick={() => onMove({ to: "trash" })}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
