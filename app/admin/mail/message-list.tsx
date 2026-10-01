"use client";

import {
  Archive,
  Check,
  FileText,
  Folder,
  Inbox,
  Paperclip,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { cn } from "@/lib/utils";
import { isExternalSender } from "./external";

export const sender = (message: MessageSummary) => {
  const from = message.from?.[0];
  return from?.name || from?.email || "Unknown sender";
};

export const when = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Up to two initials for an avatar: "Priya Raman" → "PR", "jlee@x" → "J". */
export const initials = (name: string) => {
  const words = name
    .replace(/[<>"@].*$/, "")
    .split(/[\s._-]+/)
    .filter((word) => /\p{L}|\d/u.test(word));
  const letters = words.map((word) => (word.match(/\p{L}|\d/u) ?? [""])[0]);
  return (
    (letters.length > 1
      ? letters[0] + letters[letters.length - 1]
      : (letters[0] ?? "?")
    ).toUpperCase() || "?"
  );
};

/** Who a Sent or Drafts message went to: native clients title those rows so. */
const recipients = (message: MessageSummary) =>
  (message.to ?? []).map((a) => a.name || a.email).join(", ") ||
  "undisclosed recipients";

const EMPTY_ICONS: Partial<Record<string, LucideIcon>> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  junk: ShieldAlert,
};

/** Small "External" tag, used both in the list and the open message (desk). */
export function ExternalTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-line bg-tint px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-subtle uppercase",
        className,
      )}
    >
      External
    </span>
  );
}

/** Phone: a 14px shield glyph instead of the pill. */
export function ExternalGlyph() {
  return (
    <>
      <ShieldAlert
        aria-hidden
        size={14}
        strokeWidth={2.5}
        className="shrink-0 text-ink desk:hidden"
      />
      <span className="sr-only">, from outside BrockCSC</span>
    </>
  );
}

/** 40px initials circle. Selected: ink fill with a check. */
export function Avatar({
  name,
  selected = false,
  className,
}: {
  name: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-2 border-line text-sm font-extrabold",
        selected ? "bg-ink text-surface" : "bg-tint text-ink",
        className,
      )}
    >
      {selected ? <Check size={18} strokeWidth={3} /> : initials(name)}
    </span>
  );
}

/** Loading placeholder rows. */
export function MessageListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul
      aria-hidden
      className="divide-y-2 divide-line/15 motion-safe:animate-pulse"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex gap-3 px-4 py-3">
          <span className="size-10 shrink-0 rounded-full bg-line/10 desk:hidden" />
          <span className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
            <span className="h-4 w-2/5 rounded-[6px] bg-line/15" />
            <span className="h-3.5 w-4/5 rounded-[6px] bg-line/10" />
            <span className="h-3 w-3/5 rounded-[6px] bg-line/10" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MessageList({
  messages,
  selected,
  threadCounts,
  ownDomain,
  checked,
  selecting = false,
  onSelect,
  onFlag,
  onCheck,
  onCheckAll,
  role = null,
  folderName = "this folder",
}: {
  messages: MessageSummary[];
  selected: string | null;
  threadCounts: Record<string, number>;
  ownDomain?: string | null;
  checked?: ReadonlySet<string>;
  /** Phone selection mode: a row tap toggles instead of opening. */
  selecting?: boolean;
  onSelect: (id: string) => void;
  onFlag?: (message: MessageSummary, flagged: boolean) => void;
  onCheck?: (id: string, on: boolean) => void;
  onCheckAll?: (on: boolean) => void;
  /** The folder's role: phones title Sent and Drafts rows by recipient. */
  role?: Mailbox["role"] | null;
  /** For the phone empty state. */
  folderName?: string;
}) {
  if (messages.length === 0) {
    const Icon = (role && EMPTY_ICONS[role]) || Folder;
    return (
      <>
        <p className="px-4 py-10 text-center text-sm text-subtle phone:hidden">
          Nothing here yet.
        </p>
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center desk:hidden">
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-[16px] border-2 border-line bg-tint text-ink"
          >
            <Icon className="size-6" />
          </span>
          <p className="text-base font-extrabold text-ink">
            Nothing in {folderName}
          </p>
          {role === "inbox" && (
            <p className="text-sm text-subtle">New mail shows up here.</p>
          )}
        </div>
      </>
    );
  }
  const byRecipient = role === "sent" || role === "drafts";

  const allChecked =
    !!checked && checked.size > 0 && checked.size === messages.length;

  return (
    <ul className="animate-fade-in divide-y-2 divide-line phone:divide-line/15">
      {onCheckAll && (
        <li className="flex items-center gap-2 bg-raised px-3 py-1.5 phone:hidden">
          <input
            aria-label={allChecked ? "Deselect all" : "Select all"}
            checked={allChecked}
            className="size-4 shrink-0 accent-brand"
            onChange={(e) => onCheckAll(e.target.checked)}
            type="checkbox"
          />
          <span className="text-xs font-bold text-subtle">
            {allChecked ? "All selected" : "Select all"}
          </span>
        </li>
      )}
      {messages.map((message) => {
        const unread = !message.keywords?.$seen;
        const flagged = Boolean(message.keywords?.$flagged);
        const active = message.id === selected;
        const isChecked = checked?.has(message.id) ?? false;
        const external = isExternalSender(
          message.from?.[0]?.email,
          ownDomain ?? null,
        );
        const count = threadCounts[message.threadId] ?? 1;
        const name = sender(message);
        // Phones title Sent/Drafts rows by recipient; desk keeps the sender.
        const to = byRecipient ? recipients(message) : null;
        const avatarName = to ?? name;
        const star = (
          <Star
            size={15}
            className={`transition-colors duration-[var(--dur-fast)] ease-smooth ${flagged ? "fill-brand text-brand" : "fill-transparent"}`}
            aria-hidden
          />
        );
        return (
          <li
            key={message.id}
            data-message={message.id}
            className={cn(
              "relative flex items-start gap-1 pl-2 transition-colors duration-[var(--dur-fast)] ease-smooth phone:min-h-[76px] phone:gap-3 phone:px-4 phone:py-2",
              selecting && isChecked
                ? "bg-tint"
                : active
                  ? "bg-tint"
                  : "hover:bg-raised",
            )}
          >
            {/* Phone: the avatar enters (or toggles) selection mode. */}
            {onCheck ? (
              <button
                type="button"
                aria-pressed={isChecked}
                aria-label={
                  to ? `Select message to ${to}` : `Select message from ${name}`
                }
                onClick={() => onCheck(message.id, !isChecked)}
                className="relative z-10 -m-0.5 shrink-0 rounded-full p-0.5 desk:hidden"
              >
                <Avatar name={avatarName} selected={isChecked} />
              </button>
            ) : (
              <Avatar name={avatarName} className="relative z-10 desk:hidden" />
            )}
            {onCheck && (
              <input
                aria-label={`Select message from ${name}`}
                checked={isChecked}
                className="mt-4 size-4 shrink-0 accent-brand phone:hidden"
                onChange={(e) => onCheck(message.id, e.target.checked)}
                type="checkbox"
              />
            )}
            {onFlag ? (
              <button
                type="button"
                aria-label="Star"
                aria-pressed={flagged}
                onClick={() => onFlag(message, !flagged)}
                className="mt-3.5 shrink-0 rounded-[6px] p-1 text-subtle hover:text-brand phone:hidden"
              >
                {star}
              </button>
            ) : (
              <span className="mt-3.5 shrink-0 p-1 text-subtle phone:hidden">
                {star}
              </span>
            )}
            <button
              type="button"
              data-stack-return={message.id}
              // Phone selection mode: a tap toggles the row, so it has state.
              aria-pressed={selecting && onCheck ? isChecked : undefined}
              aria-current={active && !selecting ? "true" : undefined}
              onClick={() =>
                selecting && onCheck
                  ? onCheck(message.id, !isChecked)
                  : onSelect(message.id)
              }
              className="press-flat min-w-0 flex-1 py-3 pr-3 text-left phone:static phone:py-0 phone:pr-0 phone:after:absolute phone:after:inset-0 phone:after:content-['']"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`flex min-w-0 items-center gap-1.5 truncate text-sm text-ink phone:text-base phone:leading-snug ${unread ? "font-extrabold" : "font-medium"}`}
                >
                  {unread && (
                    <>
                      <span
                        aria-hidden
                        className="size-2 shrink-0 self-center rounded-full bg-brand desk:hidden forced-colors:border forced-colors:border-[CanvasText]"
                      />
                      <span className="sr-only">Unread, </span>
                    </>
                  )}
                  {to ? (
                    <>
                      <span className="truncate desk:hidden">To: {to}</span>
                      <span className="truncate phone:hidden">{name}</span>
                    </>
                  ) : (
                    <span className="truncate">{name}</span>
                  )}
                  {external && (
                    <>
                      <ExternalTag className="phone:hidden" />
                      <ExternalGlyph />
                    </>
                  )}
                  {count > 1 && (
                    <span className="text-xs font-bold text-subtle phone:text-sm">
                      <span aria-hidden>{count}</span>
                      <span className="sr-only">, {count} messages</span>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-subtle phone:text-sm">
                  {message.hasAttachment && (
                    <>
                      <Paperclip size={12} aria-hidden />
                      <span className="sr-only">, has attachment, </span>
                    </>
                  )}
                  {when(message.receivedAt)}
                </span>
              </div>
              <div
                className={`truncate text-sm phone:pr-9 phone:text-[15px] phone:leading-snug ${unread ? "font-bold text-ink" : "text-subtle"}`}
              >
                {message.subject || "(no subject)"}
              </div>
              <div className="truncate text-xs text-subtle phone:line-clamp-2 phone:pr-9 phone:text-sm phone:leading-[1.35] phone:whitespace-normal">
                {message.preview}
              </div>
            </button>
            {/* Phone: a 44px star under the time. Viewing mode shows only a set star, as a status glyph. */}
            {onFlag ? (
              <button
                type="button"
                aria-label="Star"
                aria-pressed={flagged}
                onClick={() => onFlag(message, !flagged)}
                className="press-flat absolute right-1 bottom-2 z-10 grid size-11 place-items-center rounded-[10px] text-subtle desk:hidden"
              >
                <Star
                  size={18}
                  aria-hidden
                  className={
                    flagged ? "fill-brand text-brand" : "fill-transparent"
                  }
                />
              </button>
            ) : (
              flagged && (
                <span className="absolute right-4 bottom-4 z-10 desk:hidden">
                  <Star
                    size={16}
                    aria-hidden
                    className="fill-brand text-brand"
                  />
                  <span className="sr-only">Starred</span>
                </span>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
