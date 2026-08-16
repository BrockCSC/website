"use client";

import { useState } from "react";
import { RecipientInput, type Contact } from "./recipient-input";

export type Draft = {
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
};

export function Compose({
  from,
  contacts,
  initial,
  onClose,
  onSent,
}: {
  from: string | null;
  contacts: Contact[];
  initial?: Draft;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState<string[]>(initial?.to ?? []);
  const [cc, setCc] = useState<string[]>(initial?.cc ?? []);
  const [showCc, setShowCc] = useState((initial?.cc ?? []).length > 0);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    if (to.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc, subject, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not send this message.");
      }
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[20px] border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
        <header className="flex items-center justify-between border-b-2 border-black px-5 py-3">
          <h2 className="text-base font-extrabold text-[#9A4440]">
            New message
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-2 text-xl leading-none text-neutral-500 hover:text-black"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {from && (
            <div className="flex items-center gap-2 px-1 text-sm">
              <span className="font-bold text-neutral-500">From</span>
              <span className="font-semibold">{from}</span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <div className="flex-1">
              <RecipientInput
                label="To"
                value={to}
                onChange={setTo}
                contacts={contacts}
                autoFocus
              />
            </div>
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="rounded-[10px] border-2 border-black px-3 py-2 text-sm font-bold hover:bg-neutral-100"
              >
                Cc
              </button>
            )}
          </div>

          {showCc && (
            <RecipientInput
              label="Cc"
              value={cc}
              onChange={setCc}
              contacts={contacts}
            />
          )}

          <input
            className="w-full rounded-[10px] border-2 border-black px-3 py-2 focus:border-[#9A4440] focus:outline-none"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <textarea
            className="min-h-64 w-full resize-y rounded-[10px] border-2 border-black px-3 py-2 focus:border-[#9A4440] focus:outline-none"
            placeholder="Write your message…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          {error && <p className="text-sm font-bold text-[#9A4440]">{error}</p>}
        </div>

        <footer className="flex justify-end gap-3 border-t-2 border-black px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border-2 border-black px-4 py-2 font-bold hover:bg-neutral-100"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="rounded-[10px] border-2 border-black bg-[#9A4440] px-5 py-2 font-bold text-white shadow-[3px_3px_0_0_#000] transition hover:bg-[#863a37] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </footer>
      </div>
    </div>
  );
}
