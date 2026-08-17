"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import type {
  BodyPart,
  MessageDetail,
  MessageSummary,
} from "@/lib/mail/jmap-mail";

const addressLine = (list: MessageDetail["from"]) =>
  (list ?? []).map((a) => a.name || a.email).join(", ");

const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Inline parts belong to the body, not the attachment strip. */
const downloadable = (parts: BodyPart[] | undefined) =>
  (parts ?? []).filter((part) => part.blobId && !part.cid);

const blobUrl = (part: BodyPart) =>
  `/api/mail/blob/${encodeURIComponent(part.blobId!)}?name=${encodeURIComponent(
    part.name ?? "attachment",
  )}&type=${encodeURIComponent(part.type)}`;

const useDarkTheme = () => {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
};

export function MessageView({
  id,
  onRead,
}: {
  id: string;
  onRead?: (id: string) => void;
}) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dark = useDarkTheme();

  useEffect(() => {
    let live = true;
    const path = `/api/mail/messages/${encodeURIComponent(id)}`;
    Promise.all([
      fetch(path).then((res) =>
        res.ok ? res.json() : Promise.reject(res.status),
      ),
      fetch(`${path}/body?theme=${dark ? "dark" : "light"}`).then((res) =>
        res.ok ? res.text() : Promise.reject(res.status),
      ),
    ])
      .then(([detail, html]: [MessageDetail, string]) => {
        if (!live) return;
        setMessage(detail);
        setBody(html);
        // Reading a message is what marks it read, exactly as in any mail app.
        if (!detail.keywords?.$seen) {
          void fetch(`${path}/flags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seen: true }),
          }).then((res) => res.ok && onRead?.(id));
        }
      })
      .catch(() => live && setError("Could not load this message."));
    return () => {
      live = false;
    };
    // onRead is a fresh closure each render; the message id is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dark]);

  if (error) return <p className="p-6 text-sm font-bold text-brand">{error}</p>;
  if (!message) return <p className="p-6 text-sm text-subtle">Loading…</p>;

  const files = downloadable(message.attachments);

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <header className="border-b-2 border-line px-5 py-3">
        <p className="text-sm font-bold text-ink">
          {addressLine(message.from)}
        </p>
        <p className="text-xs text-subtle">
          to {addressLine(message.to) || "undisclosed recipients"}
          {message.cc?.length ? `, cc ${addressLine(message.cc)}` : ""} ·{" "}
          {new Date(message.receivedAt).toLocaleString()}
        </p>
        {files.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {files.map((part) => (
              <li key={part.blobId}>
                <a
                  href={blobUrl(part)}
                  download={part.name ?? "attachment"}
                  className="flex items-center gap-1.5 rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink transition hover:bg-tint"
                >
                  <Paperclip size={12} aria-hidden />
                  <span className="max-w-48 truncate">
                    {part.name ?? "attachment"}
                  </span>
                  <span className="font-medium text-subtle">
                    {size(part.size)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* Sandboxed: the body is untrusted even after sanitising. srcdoc rather
          than src so the app's own X-Frame-Options cannot block it. */}
      <iframe
        title="Message body"
        srcDoc={body}
        sandbox=""
        referrerPolicy="no-referrer"
        className="w-full min-h-0 flex-1 border-0 bg-surface"
      />
    </article>
  );
}

/** Gmail-style conversation: one thread, one message open at a time. */
export function Conversation({
  message,
  count,
  onRead,
}: {
  message: MessageSummary;
  count: number;
  onRead?: (id: string) => void;
}) {
  const [thread, setThread] = useState<MessageSummary[]>([]);
  const [open, setOpen] = useState(message.id);

  // Keyed on the selected message by its parent, so state starts fresh here.
  useEffect(() => {
    if (count <= 1) return;
    let live = true;
    fetch(`/api/mail/threads/${encodeURIComponent(message.threadId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { messages: MessageSummary[] }) => {
        if (!live) return;
        setThread(data.messages);
        setOpen(data.messages.at(-1)?.id ?? message.id);
      })
      .catch(() => live && setThread([]));
    return () => {
      live = false;
    };
  }, [message.id, message.threadId, count]);

  const markRead = (id: string) => {
    setThread((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, keywords: { ...item.keywords, $seen: true } }
          : item,
      ),
    );
    onRead?.(id);
  };

  return (
    <>
      {thread.length > 1 && (
        <ul className="max-h-40 shrink-0 divide-y-2 divide-line overflow-y-auto border-b-2 border-line">
          {thread.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpen(item.id)}
                className={`flex w-full items-baseline justify-between gap-3 px-5 py-2 text-left transition ${
                  item.id === open ? "bg-tint" : "hover:bg-raised"
                }`}
              >
                <span
                  className={`truncate text-sm text-ink ${
                    item.keywords?.$seen ? "font-medium" : "font-extrabold"
                  }`}
                >
                  {item.from?.[0]?.name || item.from?.[0]?.email || "Unknown"}
                </span>
                <span className="shrink-0 text-xs text-subtle">
                  {new Date(item.receivedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MessageView key={open} id={open} onRead={markRead} />
    </>
  );
}
