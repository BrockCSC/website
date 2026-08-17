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

const downloadable = (parts: BodyPart[] | undefined) =>
  (parts ?? []).filter((part) => part.blobId && !part.cid);

type RenderedBody = { html: string; blocked: boolean };

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
  const [showImages, setShowImages] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const dark = useDarkTheme();

  useEffect(() => {
    let live = true;
    const path = `/api/mail/messages/${encodeURIComponent(id)}`;
    Promise.all([
      fetch(path).then((res) =>
        res.ok ? res.json() : Promise.reject(res.status),
      ),
      fetch(
        `${path}/body?theme=${dark ? "dark" : "light"}${showImages ? "&images=1" : ""}`,
      ).then(async (res) =>
        res.ok
          ? {
              html: await res.text(),
              blocked: res.headers.get("x-images-blocked") === "1",
            }
          : Promise.reject(res.status),
      ),
    ])
      .then(([detail, rendered]: [MessageDetail, RenderedBody]) => {
        if (!live) return;
        setMessage(detail);
        setBody(rendered.html);
        setBlocked(rendered.blocked);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dark, showImages]);

  if (error) {
    return <p className="flex-1 p-6 text-sm font-bold text-brand">{error}</p>;
  }
  if (!message)
    return <p className="flex-1 p-6 text-sm text-subtle">Loading…</p>;

  const files = downloadable(message.attachments);

  return (
    <article className="flex min-h-0 flex-1 animate-fade-in flex-col">
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
                  className="flex items-center gap-1.5 rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink hover:bg-tint"
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

      {blocked && (
        <div className="flex items-center justify-between gap-3 border-b-2 border-line bg-tint px-5 py-2">
          <p className="text-xs font-semibold text-ink">
            This message links to images hosted elsewhere. Loading them tells
            the sender you opened it.
          </p>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="shrink-0 rounded-[10px] border-2 border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink hover:bg-raised"
          >
            Show images
          </button>
        </div>
      )}

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
        <ul className="max-h-40 shrink-0 animate-rise-in divide-y-2 divide-line overflow-y-auto border-b-2 border-line">
          {thread.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpen(item.id)}
                className={`flex w-full items-baseline justify-between gap-3 px-5 py-2 text-left ${
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
