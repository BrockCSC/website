"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Eye, Paperclip, ShieldAlert } from "lucide-react";
import type {
  BodyPart,
  MessageDetail,
  MessageSummary,
} from "@/lib/mail/jmap-mail";
import { ExternalTag } from "./message-list";
import { isExternalSender } from "./external";
import { withAs } from "./inbox-picker";
import {
  AttachmentPreview,
  blobUrl,
  previewKind,
  size,
} from "./attachment-preview";

const addressLine = (list: MessageDetail["from"]) =>
  (list ?? []).map((a) => a.name || a.email).join(", ");

/** "Jane Doe <jane@x.com>", or just the email/name alone when the other half is missing. */
const fullAddress = (a: { name: string | null; email: string } | undefined) => {
  if (!a) return "Unknown sender";
  if (a.name && a.name !== a.email) return `${a.name} <${a.email}>`;
  return a.email || a.name || "Unknown sender";
};

const ATTACHMENT_CHIP =
  "flex items-center gap-1.5 rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink hover:bg-tint";

const downloadable = (parts: BodyPart[] | undefined) =>
  (parts ?? []).filter((part) => part.blobId && !part.cid);

type RenderedBody = { html: string; blocked: boolean };

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

/** Reply-To, Bcc, timing and the raw header list, tucked behind "Details". */
function MessageDetails({ message }: { message: MessageDetail }) {
  return (
    <div className="mt-2.5 animate-rise-in space-y-2 rounded-[10px] border-2 border-line bg-raised p-3 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="font-bold text-subtle">From</dt>
        <dd className="break-all text-ink">{fullAddress(message.from?.[0])}</dd>
        {message.replyTo?.length ? (
          <>
            <dt className="font-bold text-subtle">Reply-To</dt>
            <dd className="break-all text-ink">
              {addressLine(message.replyTo)}
            </dd>
          </>
        ) : null}
        {message.bcc?.length ? (
          <>
            <dt className="font-bold text-subtle">Bcc</dt>
            <dd className="break-all text-ink">{addressLine(message.bcc)}</dd>
          </>
        ) : null}
        {message.sentAt && (
          <>
            <dt className="font-bold text-subtle">Sent</dt>
            <dd className="text-ink">
              {new Date(message.sentAt).toLocaleString()}
            </dd>
          </>
        )}
        <dt className="font-bold text-subtle">Received</dt>
        <dd className="text-ink">
          {new Date(message.receivedAt).toLocaleString()}
        </dd>
        <dt className="font-bold text-subtle">Size</dt>
        <dd className="text-ink">{size(message.size)}</dd>
      </dl>

      {message.headers.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer font-bold text-subtle hover:text-ink">
            Raw headers
          </summary>
          <div className="mt-1.5 max-h-40 overflow-y-auto rounded-[8px] bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap text-ink">
            {message.headers.map((h, i) => (
              <div key={`${h.name}-${i}`} className="break-all">
                <span className="font-bold">{h.name}:</span> {h.value}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MessageView({
  id,
  viewing,
  ownDomain,
  onRead,
}: {
  id: string;
  viewing: string | null;
  ownDomain?: string | null;
  onRead?: (id: string) => void;
}) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [details, setDetails] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const dark = useDarkTheme();

  useEffect(() => {
    let live = true;
    const path = `/api/mail/messages/${encodeURIComponent(id)}`;
    Promise.all([
      fetch(withAs(path, viewing)).then((res) =>
        res.ok ? res.json() : Promise.reject(res.status),
      ),
      fetch(
        withAs(
          `${path}/body?theme=${dark ? "dark" : "light"}${showImages ? "&images=1" : ""}`,
          viewing,
        ),
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
        if (!viewing && !detail.keywords?.$seen) {
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
  }, [id, dark, showImages, viewing]);

  if (error) {
    return <p className="flex-1 p-6 text-sm font-bold text-brand">{error}</p>;
  }
  if (!message)
    return <p className="flex-1 p-6 text-sm text-subtle">Loading…</p>;

  const files = downloadable(message.attachments);
  const external = isExternalSender(
    message.from?.[0]?.email,
    ownDomain ?? null,
  );

  return (
    <article className="flex min-h-0 flex-1 animate-fade-in flex-col">
      <header className="border-b-2 border-line px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
            <span className="truncate">{fullAddress(message.from?.[0])}</span>
            {external && <ExternalTag />}
          </p>
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            aria-expanded={details}
            className="flex shrink-0 items-center gap-1 rounded-[8px] px-1.5 py-0.5 text-xs font-bold text-subtle hover:bg-tint hover:text-ink"
          >
            Details
            <ChevronDown
              size={13}
              aria-hidden
              className={`transition-transform duration-[var(--dur-fast)] ${details ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <p className="text-xs text-subtle">
          to {addressLine(message.to) || "undisclosed recipients"}
          {message.cc?.length ? `, cc ${addressLine(message.cc)}` : ""} ·{" "}
          {new Date(message.receivedAt).toLocaleString()}
        </p>

        {external && (
          <p className="mt-2 flex items-center gap-1.5 rounded-[8px] border-2 border-line bg-tint px-2.5 py-1.5 text-xs font-semibold text-ink">
            <ShieldAlert
              size={14}
              className="shrink-0 text-brand"
              aria-hidden
            />
            This message was sent from outside BrockCSC&rsquo;s mail. Be careful
            with links, attachments and requests for information.
          </p>
        )}

        {details && <MessageDetails message={message} />}

        {files.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {files.map((part, i) => {
              const label = (
                <>
                  <span className="max-w-48 truncate">
                    {part.name ?? "attachment"}
                  </span>
                  <span className="font-medium text-subtle">
                    {size(part.size)}
                  </span>
                </>
              );
              return (
                <li key={part.blobId}>
                  {previewKind(part.type) ? (
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(i)}
                      className={ATTACHMENT_CHIP}
                    >
                      <Eye size={12} aria-hidden />
                      {label}
                    </button>
                  ) : (
                    <a
                      href={blobUrl(part, viewing)}
                      download={part.name ?? "attachment"}
                      className={ATTACHMENT_CHIP}
                    >
                      <Paperclip size={12} aria-hidden />
                      {label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </header>

      {previewIndex !== null && (
        <AttachmentPreview
          files={files}
          index={previewIndex}
          viewing={viewing}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}

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
          than src so the app's own X-Frame-Options cannot block it.
          allow-popups (+ allow-popups-to-escape-sandbox so the opened tab
          isn't itself sandboxed) lets target="_blank" links in the body
          actually open, without granting the frame scripts, forms or
          same-origin access. */}
      <iframe
        title="Message body"
        srcDoc={body}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full min-h-0 flex-1 border-0 bg-surface"
      />
    </article>
  );
}

export function Conversation({
  message,
  count,
  viewing,
  ownDomain,
  onRead,
}: {
  message: MessageSummary;
  count: number;
  viewing: string | null;
  ownDomain?: string | null;
  onRead?: (id: string) => void;
}) {
  const [thread, setThread] = useState<MessageSummary[]>([]);
  const [open, setOpen] = useState(message.id);

  useEffect(() => {
    if (count <= 1) return;
    let live = true;
    fetch(
      withAs(
        `/api/mail/threads/${encodeURIComponent(message.threadId)}`,
        viewing,
      ),
    )
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
  }, [message.id, message.threadId, count, viewing]);

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
                  className={`flex min-w-0 items-center gap-1.5 truncate text-sm text-ink ${
                    item.keywords?.$seen ? "font-medium" : "font-extrabold"
                  }`}
                >
                  <span className="truncate">
                    {item.from?.[0]?.name || item.from?.[0]?.email || "Unknown"}
                  </span>
                  {isExternalSender(
                    item.from?.[0]?.email,
                    ownDomain ?? null,
                  ) && <ExternalTag />}
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
      <MessageView
        key={open}
        id={open}
        onRead={markRead}
        ownDomain={ownDomain}
        viewing={viewing}
      />
    </>
  );
}
