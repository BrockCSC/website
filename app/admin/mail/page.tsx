"use client";

import { useEffect, useMemo, useState } from "react";
import { logout } from "@/lib/api";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { useSession } from "../session";
import { MailboxList } from "./mailbox-list";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { Compose, type Draft } from "./compose";
import type { Contact } from "./recipient-input";

export default function MailPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const { refresh } = useSession();

  useEffect(() => {
    fetch("/api/mail/mailboxes")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((boxes: Mailbox[]) => {
        setMailboxes(boxes);
        setMailbox((current) => current ?? boxes[0]?.id ?? null);
      })
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
  }, []);

  useEffect(() => {
    if (!mailbox) return;
    fetch(`/api/mail/messages?mailbox=${encodeURIComponent(mailbox)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setError("Could not load messages."));
  }, [mailbox, reload]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return messages;
    const haystack = (message: MessageSummary) =>
      [
        message.subject,
        message.preview,
        ...(message.from ?? []).map((a) => `${a.name ?? ""} ${a.email}`),
      ]
        .join(" ")
        .toLowerCase();
    return messages.filter((message) => haystack(message).includes(query));
  }, [messages, search]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading mail…</p>;
  }
  // The dashboard cookie outlives the Keycloak session mail borrows tokens
  // from, so mail alone can go stale while the rest of the admin still works.
  if (expired) {
    return (
      <div className="rounded-[20px] border-2 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]">
        <p className="font-bold text-[#9A4440]">Your mail session expired.</p>
        <p className="mt-2 max-w-prose text-sm text-neutral-600">
          Mail signs in to the mail server on your behalf, and that sign-in
          lapses after 30 minutes of inactivity. Signing in again reconnects it.
        </p>
        <button
          type="button"
          onClick={async () => {
            await logout();
            await refresh();
          }}
          className="mt-5 rounded-[10px] border-2 border-black bg-[#9A4440] px-4 py-2 font-bold text-white shadow-[3px_3px_0_0_#000] transition hover:bg-[#863a37]"
        >
          Sign in again
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-[20px] border-2 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]">
        <p className="font-bold text-[#9A4440]">{error}</p>
      </div>
    );
  }

  const current = mailboxes.find((box) => box.id === mailbox);
  const message = visible.find((item) => item.id === selected) ?? null;

  return (
    <div className="flex h-[calc(100vh-11rem)] gap-4">
      <aside className="flex w-52 shrink-0 flex-col gap-3">
        <button
          type="button"
          onClick={() => setDraft({})}
          className="rounded-[10px] border-2 border-black bg-[#9A4440] px-4 py-2.5 font-bold text-white shadow-[3px_3px_0_0_#000] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-[#863a37] hover:shadow-[2px_2px_0_0_#000]"
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

      <div className="flex min-w-0 flex-1 overflow-hidden rounded-[20px] border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
        <div className="flex w-80 shrink-0 flex-col border-r-2 border-black">
          <header className="space-y-2 border-b-2 border-black px-4 py-2.5">
            <div>
              <h2 className="text-sm font-extrabold">
                {current?.name ?? "Mail"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {visible.length} message{visible.length === 1 ? "" : "s"}
              </p>
            </div>
            <input
              className="w-full rounded-[8px] border-2 border-black px-2 py-1 text-sm focus:border-[#9A4440] focus:outline-none"
              placeholder="Search this folder"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList
              messages={visible}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {message && (
            <MessageActions message={message} from={from} onDraft={setDraft} />
          )}
          {selected ? (
            <MessageView key={selected} id={selected} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Select a message to read it.
            </p>
          )}
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

const quote = (message: MessageSummary) =>
  `\n\nOn ${new Date(message.receivedAt).toLocaleString()}, ${
    message.from?.[0]?.email ?? "someone"
  } wrote:\n> ${message.preview}`;

const prefixed = (subject: string | null, prefix: string) =>
  subject?.toLowerCase().startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject ?? ""}`.trim();

function MessageActions({
  message,
  from,
  onDraft,
}: {
  message: MessageSummary;
  from: string | null;
  onDraft: (draft: Draft) => void;
}) {
  const sender = message.from?.[0]?.email;
  const others = (message.to ?? [])
    .map((address) => address.email)
    .filter((email) => email !== from && email !== sender);

  const action =
    "rounded-[8px] border-2 border-black px-3 py-1.5 text-sm font-bold transition hover:bg-[#fff1f0]";

  return (
    <div className="flex gap-2 border-b-2 border-black px-5 py-2.5">
      <button
        type="button"
        className={action}
        onClick={() =>
          onDraft({
            to: sender ? [sender] : [],
            subject: prefixed(message.subject, "Re:"),
            text: quote(message),
          })
        }
      >
        Reply
      </button>
      {others.length > 0 && (
        <button
          type="button"
          className={action}
          onClick={() =>
            onDraft({
              to: sender ? [sender] : [],
              cc: others,
              subject: prefixed(message.subject, "Re:"),
              text: quote(message),
            })
          }
        >
          Reply all
        </button>
      )}
      <button
        type="button"
        className={action}
        onClick={() =>
          onDraft({
            subject: prefixed(message.subject, "Fwd:"),
            text: quote(message),
          })
        }
      >
        Forward
      </button>
    </div>
  );
}
