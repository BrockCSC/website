"use client";

import { useState } from "react";

const splitAddresses = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export function Compose({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    const recipients = splitAddresses(to);
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipients, subject, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not send this message.");
      }
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  const field =
    "w-full rounded-[10px] border-2 border-black px-3 py-2 focus:outline-none focus:border-[#9A4440]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-[20px] border-2 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]">
        <h2 className="mb-4 text-lg font-extrabold text-[#9A4440]">
          New message
        </h2>

        <div className="space-y-3">
          <input
            className={field}
            placeholder="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            autoFocus
          />
          <input
            className={field}
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <textarea
            className={`${field} min-h-48 resize-y`}
            placeholder="Write your message…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        {error && (
          <p className="mt-3 text-sm font-bold text-[#9A4440]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border-2 border-black px-4 py-2 font-bold hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="rounded-[10px] border-2 border-black bg-[#9A4440] px-5 py-2 font-bold text-white shadow-[3px_3px_0_0_#000] transition hover:bg-[#863a37] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
