"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Eye,
  ImageOff,
  Paperclip,
  RotateCw,
  ShieldAlert,
} from "lucide-react";
import type {
  BodyPart,
  MessageDetail,
  MessageSummary,
} from "@/lib/mail/jmap-mail";
import { BELOW_LG, mediaMatches } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Avatar, ExternalTag, sender, when } from "./message-list";
import { isExternalSender } from "./external";
import { withAs } from "./inbox-picker";
import {
  AttachmentPreview,
  blobUrl,
  previewKind,
  size,
} from "./attachment-preview";
import { fitEmail, unfitEmail } from "./fit-email";

const addressLine = (list: MessageDetail["from"]) =>
  (list ?? []).map((a) => a.name || a.email).join(", ");

/** "Jane Doe <jane@x.com>", or just the email/name alone when the other half is missing. */
const fullAddress = (a: { name: string | null; email: string } | undefined) => {
  if (!a) return "Unknown sender";
  if (a.name && a.name !== a.email) return `${a.name} <${a.email}>`;
  return a.email || a.name || "Unknown sender";
};

/** Phone dates: no seconds. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const ATTACHMENT_CHIP =
  "flex items-center gap-1.5 rounded-[10px] border-2 border-line bg-raised px-2.5 py-1 text-xs font-bold text-ink hover:bg-tint";

const downloadable = (parts: BodyPart[] | undefined) =>
  (parts ?? []).filter((part) => part.blobId && !part.cid);

/** "report.final.pdf" → ["report.final", ".pdf"], so the extension survives truncation. */
const splitName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 6
    ? [name.slice(0, dot), name.slice(dot)]
    : [name, ""];
};

const typeBadge = (part: BodyPart) => {
  const ext = splitName(part.name ?? "")[1].slice(1);
  if (ext) return ext.toUpperCase();
  const sub = part.type.split("/")[1] ?? "file";
  return sub.split(/[.+-]/)[0].toUpperCase().slice(0, 4);
};

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
function MessageDetails({
  message,
  id,
  compact = false,
}: {
  message: MessageDetail;
  id?: string;
  /** Phone: also To and Cc, dates without seconds, 14px. */
  compact?: boolean;
}) {
  const date = compact
    ? shortDate
    : (iso: string) => new Date(iso).toLocaleString();
  return (
    <div
      id={id}
      className={cn(
        "mt-2.5 animate-rise-in space-y-2 rounded-[10px] border-2 border-line bg-raised p-3",
        compact ? "mt-1 text-sm" : "text-xs",
      )}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="font-bold text-subtle">From</dt>
        <dd className="wrap-anywhere text-ink">
          {fullAddress(message.from?.[0])}
        </dd>
        {compact && (
          <>
            <dt className="font-bold text-subtle">To</dt>
            <dd className="wrap-anywhere text-ink">
              {(message.to ?? []).map(fullAddress).join(", ") ||
                "Undisclosed recipients"}
            </dd>
            {message.cc?.length ? (
              <>
                <dt className="font-bold text-subtle">Cc</dt>
                <dd className="wrap-anywhere text-ink">
                  {message.cc.map(fullAddress).join(", ")}
                </dd>
              </>
            ) : null}
          </>
        )}
        {message.replyTo?.length ? (
          <>
            <dt className="font-bold text-subtle">Reply-To</dt>
            <dd className="wrap-anywhere text-ink">
              {addressLine(message.replyTo)}
            </dd>
          </>
        ) : null}
        {message.bcc?.length ? (
          <>
            <dt className="font-bold text-subtle">Bcc</dt>
            <dd className="wrap-anywhere text-ink">
              {addressLine(message.bcc)}
            </dd>
          </>
        ) : null}
        {message.sentAt && (
          <>
            <dt className="font-bold text-subtle">Sent</dt>
            <dd className="text-ink">{date(message.sentAt)}</dd>
          </>
        )}
        <dt className="font-bold text-subtle">Received</dt>
        <dd className="text-ink">{date(message.receivedAt)}</dd>
        <dt className="font-bold text-subtle">Size</dt>
        <dd className="text-ink">{size(message.size)}</dd>
      </dl>

      {message.headers.length > 0 && (
        <details className="pt-1">
          <summary
            className={cn(
              "cursor-pointer font-bold text-subtle hover:text-ink",
              compact && "flex min-h-11 items-center",
            )}
          >
            Raw headers
          </summary>
          <div className="mt-1.5 max-h-40 overflow-y-auto overscroll-contain rounded-[8px] bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap text-ink">
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

/** "to Jordan Lee +5": the first recipient and a count of the rest. */
const recipientsSummary = (message: MessageDetail) => {
  const all = [...(message.to ?? []), ...(message.cc ?? [])];
  if (!all.length) return "to undisclosed recipients";
  const first = all[0].name || all[0].email;
  return all.length > 1 ? `to ${first} +${all.length - 1}` : `to ${first}`;
};

/** Phone: avatar + name + time, the full address, and the recipients disclosure. */
function CompactHeader({
  message,
  external,
  details,
  onDetailsChange,
}: {
  message: MessageDetail;
  external: boolean;
  details: boolean;
  onDetailsChange: (open: boolean) => void;
}) {
  const from = message.from?.[0];
  const name = from?.name || from?.email || "Unknown sender";
  const email = from?.email ?? "";
  const at = email.lastIndexOf("@");
  const local = at > 0 ? email.slice(0, at + 1) : email;
  const domain = at > 0 ? email.slice(at + 1) : "";

  // The avatar sits beside the name, address and recipients rather than
  // owning a row, so the body starts sooner (complaint #1).
  return (
    <div className="px-4 pt-2 desk:hidden">
      <div className="flex gap-3">
        <Avatar name={name} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-base font-bold text-ink">
              <span className="truncate">{name}</span>
              {external && (
                // Landscape: the note joins the name row (the line below
                // stays for screen readers).
                <span
                  aria-hidden
                  className="hidden min-w-0 items-center gap-1 text-sm short:inline-flex"
                >
                  <ShieldAlert
                    size={15}
                    strokeWidth={2.5}
                    className="shrink-0 text-brand"
                  />
                  <span className="truncate">
                    Outside sender{domain && ` · ${domain}`}
                  </span>
                </span>
              )}
            </p>
            <time
              dateTime={message.receivedAt}
              className="shrink-0 text-sm text-subtle"
            >
              {when(message.receivedAt)}
            </time>
          </div>
          {external ? (
            // Visible at every height (landscape too): the sending domain
            // is the cue, so it replaces the address line.
            <p
              role="note"
              className="flex items-start gap-1 text-sm text-subtle short:sr-only"
            >
              <ShieldAlert
                aria-hidden
                size={15}
                strokeWidth={2.5}
                className="mt-[3px] shrink-0 text-brand"
              />
              <span className="min-w-0 wrap-anywhere">
                <span className="font-bold text-ink">Outside sender</span>
                {domain && (
                  <>
                    {" · "}
                    <span className="font-bold text-ink">{domain}</span>
                  </>
                )}
                <span className="sr-only">
                  . This message was sent from outside BrockCSC&rsquo;s mail. Be
                  careful with links, attachments and requests for information.
                </span>
              </span>
            </p>
          ) : (
            email && (
              <p className="text-sm wrap-anywhere text-subtle short:hidden">
                {local}
                {domain}
              </p>
            )
          )}
          <button
            type="button"
            aria-expanded={details}
            aria-controls="msg-details"
            onClick={() => onDetailsChange(!details)}
            // 40px box, 44px hit area.
            className="press-flat relative -ml-1.5 inline-flex min-h-10 max-w-full items-center gap-1 rounded-[10px] px-1.5 text-sm text-subtle before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] short:min-h-9 short:before:-inset-y-1"
          >
            <span className="truncate">{recipientsSummary(message)}</span>
            <ChevronDown
              size={16}
              aria-hidden
              className={cn(
                "shrink-0 transition-transform duration-[var(--dur-fast)]",
                details && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
      {/* Always mounted (hidden while collapsed) so aria-controls resolves. */}
      <div id="msg-details" hidden={!details}>
        {details && <MessageDetails message={message} compact />}
      </div>
    </div>
  );
}

/** Phone: attachments as a horizontal strip below the body. */
function AttachmentStrip({
  files,
  viewing,
  onPreview,
}: {
  files: BodyPart[];
  viewing: string | null;
  onPreview: (index: number) => void;
}) {
  const single = files.length === 1;
  return (
    <section
      aria-label="Attachments"
      className="border-t-2 border-line/15 pt-3 pb-4 desk:hidden"
    >
      <p className="px-4 pb-2 text-sm font-bold text-subtle">
        {files.length} {single ? "attachment" : "attachments"}
      </p>
      <ul
        className={cn(
          "flex gap-2 px-4",
          !single &&
            "snap-x scroll-px-4 overflow-x-auto overscroll-x-contain pb-1",
        )}
      >
        {files.map((part, i) => {
          const name = part.name ?? "attachment";
          const tileClass = cn(
            "press-flat flex min-h-14 snap-start items-center gap-2.5 rounded-[10px] border-2 border-line bg-surface px-2.5 py-2 text-left",
            // Two tiles per screen, so a name gets two lines.
            single ? "w-full" : "w-[calc(50%-0.25rem)] shrink-0",
          );
          const body = (
            <>
              <span
                aria-hidden
                className="grid h-9 min-w-9 shrink-0 place-items-center rounded-[8px] border-2 border-line bg-tint px-0.5 text-[11px] font-extrabold text-ink"
              >
                {typeBadge(part)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 text-sm leading-tight font-bold wrap-anywhere text-ink">
                  {name}
                </span>
                <span className="text-xs text-subtle">{size(part.size)}</span>
              </span>
            </>
          );
          return (
            <li key={part.blobId} className={single ? "w-full" : "contents"}>
              {previewKind(part.type) ? (
                <button
                  type="button"
                  onClick={() => onPreview(i)}
                  aria-label={`${name}, ${size(part.size)}`}
                  className={tileClass}
                >
                  {body}
                </button>
              ) : (
                <a
                  href={blobUrl(part, viewing)}
                  download={name}
                  aria-label={`Download ${name}, ${size(part.size)}`}
                  className={tileClass}
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MessageSkeleton() {
  return (
    <div
      aria-hidden
      className="flex-1 px-5 py-4 motion-safe:animate-pulse phone:px-4"
    >
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-full bg-line/10 desk:hidden" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-4 w-1/2 rounded-[6px] bg-line/15" />
          <span className="h-3 w-3/4 rounded-[6px] bg-line/10" />
        </span>
      </div>
      <div className="mt-6 space-y-2.5">
        <span className="block h-3 w-full rounded-[6px] bg-line/10" />
        <span className="block h-3 w-11/12 rounded-[6px] bg-line/10" />
        <span className="block h-3 w-4/5 rounded-[6px] bg-line/10" />
        <span className="block h-3 w-2/3 rounded-[6px] bg-line/10" />
      </div>
    </div>
  );
}

export function RetryRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-6 phone:px-4">
      <p className="text-sm font-bold text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="press-flat inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-line bg-surface px-3 font-bold text-ink"
      >
        <RotateCw size={16} aria-hidden />
        Try again
      </button>
    </div>
  );
}

export type FitState = { wide: boolean };

function MessageView({
  id,
  viewing,
  ownDomain,
  onRead,
  fit,
  onFitted,
  details,
  onDetailsChange,
}: {
  id: string;
  viewing: string | null;
  ownDomain?: string | null;
  onRead?: (id: string) => void;
  /** Below lg: scale wide HTML bodies to the frame (default) or show them at original size. */
  fit: boolean;
  onFitted?: (id: string, state: FitState) => void;
  details: boolean;
  onDetailsChange: (open: boolean) => void;
}) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showImages, setShowImages] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const frameObserver = useRef<ResizeObserver | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fitRef = useRef(fit);
  const fittedWidth = useRef(0);
  const latest = useRef({ onFitted });
  const dark = useDarkTheme();

  useEffect(() => {
    latest.current = { onFitted };
  });

  // Below lg, wide HTML newsletters are scaled to the frame with CSS zoom on
  // the frame's body (spec D13). lg keeps today's rendering untouched.
  const refit = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    if (!mediaMatches(BELOW_LG)) {
      if (unfitEmail(frame)) setBodyHeight(doc.documentElement.scrollHeight);
      return;
    }
    const result = fitEmail(frame, fitRef.current);
    if (!result) return;
    fittedWidth.current = result.avail;
    setBodyHeight(doc.documentElement.scrollHeight);
    latest.current.onFitted?.(id, { wide: result.wide });
  }, [id]);

  // The header (sender, subject, attachments) and the message body used to
  // scroll independently, squeezing the body into whatever space was left
  // over — on a phone that could be a couple of lines. allow-same-origin
  // (still with no allow-scripts, so nothing in the body can ever execute)
  // lets the parent measure the sandboxed document so the iframe can be
  // sized to its content and scroll as one continuous page with everything
  // else, like a real mail app.
  const onBodyLoad = () => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.documentElement) return;
    setBodyHeight(doc.documentElement.scrollHeight);
    // The inner observer owns the height only.
    resizeObserver.current?.disconnect();
    resizeObserver.current = new ResizeObserver(
      () =>
        doc.documentElement && setBodyHeight(doc.documentElement.scrollHeight),
    );
    resizeObserver.current.observe(doc.documentElement);

    // The outer one re-fits, and only when the frame's width changed, which
    // breaks the fit ↔ height loop.
    frameObserver.current?.disconnect();
    frameObserver.current = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - fittedWidth.current) > 0.5)
        refit();
    });
    frameObserver.current.observe(frame);

    refit();
    // Late images change the body's width: listen for their load events
    // (capture, since load doesn't bubble), and re-fit twice more in case
    // the engine doesn't deliver them from a script-less sandbox.
    doc.addEventListener("load", refit, true);
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(refit, 300), setTimeout(refit, 1500)];
  };

  useEffect(
    () => () => {
      resizeObserver.current?.disconnect();
      frameObserver.current?.disconnect();
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    fitRef.current = fit;
    refit();
  }, [fit, refit]);

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
        setError(null);
        setMessage(detail);
        setBody(rendered.html);
        setBlocked(rendered.blocked);
        if (!viewing && !detail.keywords?.$seen) {
          void fetch(`${path}/flags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seen: true }),
          })
            .then((res) => res.ok && onRead?.(id))
            .catch(() => {});
        }
      })
      .catch(() => live && setError("Could not load this message."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dark, showImages, viewing, attempt]);

  if (error && !message) {
    return (
      <RetryRow
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }
  if (!message)
    return (
      <>
        <span className="sr-only" role="status">
          Loading…
        </span>
        <MessageSkeleton />
      </>
    );

  const files = downloadable(message.attachments);
  const external = isExternalSender(
    message.from?.[0]?.email,
    ownDomain ?? null,
  );

  return (
    // desk below lg: a stable gutter, so a classic scrollbar coming and going
    // doesn't change the frame's width and re-fit in a loop.
    <article className="flex min-h-0 flex-1 animate-fade-in flex-col overflow-y-auto desk:overscroll-contain phone:flex-none phone:overflow-visible desk:max-lg:[scrollbar-gutter:stable]">
      <header className="shrink-0 border-b-2 border-line px-5 py-3 phone:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
            <span className="truncate">{fullAddress(message.from?.[0])}</span>
            {external && <ExternalTag />}
          </p>
          <button
            type="button"
            onClick={() => onDetailsChange(!details)}
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

      <CompactHeader
        message={message}
        external={external}
        details={details}
        onDetailsChange={onDetailsChange}
      />

      <AttachmentPreview
        files={files}
        index={previewIndex}
        viewing={viewing}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />

      {blocked && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-line bg-tint px-5 py-2 phone:hidden">
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
          <div className="mt-1 flex min-h-11 items-center gap-2 border-y-2 border-line/15 bg-raised pr-2 pl-4 text-sm text-subtle desk:hidden short:mt-0 short:min-h-9">
            <ImageOff size={16} aria-hidden className="shrink-0" />
            <p className="min-w-0 flex-1 truncate">
              Images hidden
              <span className="sr-only">
                . Loading them tells the sender you opened it.
              </span>
            </p>
            <button
              type="button"
              onClick={() => setShowImages(true)}
              // Landscape: a 36px row with a 44px hit area.
              className="press-flat relative min-h-11 shrink-0 rounded-[10px] px-3 font-bold text-ink short:min-h-9 short:before:absolute short:before:inset-x-0 short:before:-inset-y-1 short:before:content-['']"
            >
              Load
            </button>
          </div>
        </>
      )}

      {/* Sandboxed: the body is untrusted even after sanitising. srcdoc rather
          than src so the app's own X-Frame-Options cannot block it.
          allow-popups (+ allow-popups-to-escape-sandbox so the opened tab
          isn't itself sandboxed) lets target="_blank" links in the body
          actually open. allow-same-origin lets the parent measure the
          document so the iframe can be sized to its content and scroll as
          one page with the header above it, instead of being squeezed into
          whatever space was left over; there's still no allow-scripts, so
          nothing inside the body can ever run regardless of origin. */}
      <iframe
        ref={iframeRef}
        title="Message body"
        srcDoc={body}
        onLoad={onBodyLoad}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        referrerPolicy="no-referrer"
        style={bodyHeight ? { height: `${bodyHeight}px` } : undefined}
        className={cn(
          "w-full shrink-0 border-0 bg-surface",
          !bodyHeight && "min-h-40 animate-fade-in",
        )}
      />

      {files.length > 0 && (
        <AttachmentStrip
          files={files}
          viewing={viewing}
          onPreview={setPreviewIndex}
        />
      )}
    </article>
  );
}

const threadDate = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Phone: one "N earlier messages" pill that expands into 56px cards. */
function ThreadCards({
  thread,
  open,
  onOpenChange,
}: {
  thread: MessageSummary[];
  open: string;
  onOpenChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const others = thread.length - 1;
  const openIsLast = thread.at(-1)?.id === open;
  return (
    <div className="px-4 desk:hidden">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="msg-thread"
        onClick={() => setExpanded((value) => !value)}
        // A flat full-bleed row with the chevron after the text, not a
        // select-like box. Landscape: 36px, with a 44px hit area.
        className="press-flat relative -mx-4 flex min-h-11 w-[calc(100%+2rem)] items-center gap-1.5 border-y-2 border-line/15 px-4 text-left text-sm font-bold text-ink short:min-h-9 short:before:absolute short:before:inset-x-0 short:before:-inset-y-1 short:before:content-['']"
      >
        <span className="min-w-0 truncate">
          {others} {openIsLast ? "earlier" : "other"}{" "}
          {others === 1 ? "message" : "messages"}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 transition-transform duration-[var(--dur-fast)]",
            expanded && "rotate-180",
          )}
        />
      </button>
      {/* Always mounted (hidden while collapsed) so aria-controls resolves. */}
      <ul
        id="msg-thread"
        hidden={!expanded}
        className="mt-2 animate-rise-in divide-y-2 divide-line/15 overflow-hidden rounded-[10px] border-2 border-[var(--line-strong)]"
      >
        {thread.map((item) => {
          const name = sender(item);
          const current = item.id === open;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => {
                  onOpenChange(item.id);
                  setExpanded(false);
                }}
                className={cn(
                  "press-flat flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left",
                  current && "bg-tint",
                )}
              >
                <Avatar name={name} className="size-8 text-xs" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm text-ink",
                        item.keywords?.$seen
                          ? "font-semibold"
                          : "font-extrabold",
                      )}
                    >
                      {name}
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {threadDate(item.receivedAt)}
                    </span>
                  </span>
                  <span className="truncate text-sm text-subtle">
                    {item.preview}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Conversation({
  message,
  thread,
  open,
  onOpenChange,
  viewing,
  ownDomain,
  onRead,
  fit,
  onFitted,
  details,
  onDetailsChange,
}: {
  message: MessageSummary;
  /** The loaded thread (oldest first); empty until loaded or for a single message. */
  thread: MessageSummary[];
  /** The thread message whose body is showing. */
  open: string;
  onOpenChange: (id: string) => void;
  viewing: string | null;
  ownDomain?: string | null;
  onRead?: (id: string) => void;
  fit: boolean;
  onFitted?: (id: string, state: FitState) => void;
  details: boolean;
  onDetailsChange: (open: boolean) => void;
}) {
  return (
    <>
      {thread.length > 1 && (
        <>
          <ul className="max-h-40 shrink-0 animate-rise-in divide-y-2 divide-line overflow-y-auto border-b-2 border-line phone:hidden">
            {thread.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenChange(item.id)}
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
                      {item.from?.[0]?.name ||
                        item.from?.[0]?.email ||
                        "Unknown"}
                    </span>
                    {isExternalSender(
                      item.from?.[0]?.email,
                      ownDomain ?? null,
                    ) && <ExternalTag />}
                  </span>
                  <span className="shrink-0 text-xs text-subtle">
                    {threadDate(item.receivedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <ThreadCards
            key={message.id}
            thread={thread}
            open={open}
            onOpenChange={onOpenChange}
          />
        </>
      )}
      <MessageView
        key={open}
        id={open}
        onRead={onRead}
        ownDomain={ownDomain}
        viewing={viewing}
        fit={fit}
        onFitted={onFitted}
        details={details}
        onDetailsChange={onDetailsChange}
      />
    </>
  );
}
