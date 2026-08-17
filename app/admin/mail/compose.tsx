"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Editor } from "./editor";
import { toPlainText } from "./html";
import { RecipientInput, type Contact } from "./recipient-input";

export type Draft = {
  to?: string[];
  cc?: string[];
  subject?: string;
  html?: string;
};

type Upload = { blobId: string; name: string; type: string; size: number };

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
  const [files, setFiles] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const attach = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      setUploading((count) => count + 1);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/mail/upload", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as Upload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not attach that.");
        setFiles((prev) => [...prev, data]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not attach that.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const send = async () => {
    setError(null);
    if (to.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    const html = body.current?.innerHTML ?? "";
    const text = body.current ? toPlainText(body.current) : "";
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          subject,
          text,
          html: html || undefined,
          attachments: files.map(({ blobId, type, name }) => ({
            blobId,
            type,
            name,
          })),
        }),
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
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/40 px-4 dark:bg-surface/80">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New message"
        className="flex max-h-[90vh] w-full max-w-3xl animate-pop-in flex-col overflow-hidden rounded-[20px] border-2 border-line bg-surface shadow-brut"
      >
        <header className="flex items-center justify-between border-b-2 border-line px-5 py-3">
          <h2 className="text-base font-extrabold text-brand">New message</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-2 text-xl leading-none text-subtle hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {from && (
            <div className="flex items-center gap-2 px-1 text-sm">
              <span className="font-bold text-subtle">From</span>
              <span className="font-semibold text-ink">{from}</span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <div className="flex-1">
              <RecipientInput
                label="To"
                value={to}
                onChange={setTo}
                contacts={contacts}
                autoFocus={!initial?.html}
              />
            </div>
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="rounded-[10px] border-2 border-line px-3 py-2 text-sm font-bold text-ink hover:bg-tint"
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
            className="w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <Editor
            editorRef={body}
            initialHtml={initial?.html ?? ""}
            autoFocus={Boolean(initial?.html)}
          />

          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((file) => (
                <li
                  key={file.blobId}
                  className="flex animate-pop-in items-center gap-1.5 rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink"
                >
                  <Paperclip size={12} aria-hidden />
                  <span className="max-w-48 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setFiles((prev) =>
                        prev.filter((item) => item.blobId !== file.blobId),
                      )
                    }
                    className="text-subtle hover:text-brand"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="animate-rise-in text-sm font-bold text-brand">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t-2 border-line px-5 py-3">
          <label className="cursor-pointer rounded-[10px] border-2 border-line px-3 py-2 text-sm font-bold text-ink hover:bg-tint">
            <Paperclip size={15} className="inline" aria-hidden />
            <span className="ml-1.5">
              {uploading > 0 ? "Uploading…" : "Attach"}
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void attach(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border-2 border-line px-4 py-2 font-bold text-ink hover:bg-tint"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending || uploading > 0}
              className="rounded-[10px] border-2 border-line bg-brand px-5 py-2 font-bold text-brand-ink shadow-brut-sm hover:opacity-90 disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
