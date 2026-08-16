"use client";

import { useEffect, useState } from "react";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { MailboxList } from "./mailbox-list";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";

export default function MailPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
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

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_20rem_1fr]">
      <MailboxList
        mailboxes={mailboxes}
        selected={mailbox}
        onSelect={(id) => {
          setSelected(null);
          setMailbox(id);
        }}
      />

      <div className="max-h-[70vh] overflow-y-auto rounded-[20px] border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
        <MessageList
          messages={messages}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <div className="min-h-[70vh] overflow-hidden rounded-[20px] border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
        {selected ? (
          <MessageView key={selected} id={selected} />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Select a message to read it.
          </p>
        )}
      </div>
    </div>
  );
}
