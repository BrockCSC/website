"use client";

import { useEffect, useState } from "react";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { MailboxList } from "./mailbox-list";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { Compose } from "./compose";

export default function MailPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mail/mailboxes")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((boxes: Mailbox[]) => {
        setMailboxes(boxes);
        setMailbox((current) => current ?? boxes[0]?.id ?? null);
      })
      .catch((status) =>
        setError(
          status === 401
            ? "Your session expired. Sign in again."
            : "Could not reach the mail server.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!mailbox) return;
    fetch(`/api/mail/messages?mailbox=${encodeURIComponent(mailbox)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setError("Could not load messages."));
  }, [mailbox]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading mail…</p>;
  }
  if (error) {
    return (
      <div className="rounded-[20px] border-2 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]">
        <p className="font-bold text-[#9A4440]">{error}</p>
      </div>
    );
  }

  const current = mailboxes.find((box) => box.id === mailbox);

  return (
    <div className="flex h-[calc(100vh-11rem)] gap-4">
      <aside className="flex w-52 shrink-0 flex-col gap-3">
        <button
          type="button"
          onClick={() => setComposing(true)}
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
          <header className="border-b-2 border-black px-4 py-2.5">
            <h2 className="text-sm font-extrabold">
              {current?.name ?? "Mail"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList
              messages={messages}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <MessageView key={selected} id={selected} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Select a message to read it.
            </p>
          )}
        </div>
      </div>

      {composing && (
        <Compose
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            if (mailbox) setMailbox(mailbox);
          }}
        />
      )}
    </div>
  );
}
