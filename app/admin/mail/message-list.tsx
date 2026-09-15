"use client";

import { Paperclip, Star } from "lucide-react";
import type { MessageSummary } from "@/lib/mail/jmap-mail";
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

/** Small "External" tag, used both in the list and the open message. */
export function ExternalTag() {
  return (
    <span className="shrink-0 rounded-full border-2 border-line bg-tint px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-subtle uppercase">
      External
    </span>
  );
}

export function MessageList({
  messages,
  selected,
  threadCounts,
  ownDomain,
  checked,
  onSelect,
  onFlag,
  onCheck,
  onCheckAll,
}: {
  messages: MessageSummary[];
  selected: string | null;
  threadCounts: Record<string, number>;
  ownDomain?: string | null;
  checked?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onFlag?: (message: MessageSummary, flagged: boolean) => void;
  onCheck?: (id: string, on: boolean) => void;
  onCheckAll?: (on: boolean) => void;
}) {
  if (messages.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-subtle">
        Nothing here yet.
      </p>
    );
  }

  const allChecked =
    !!checked && checked.size > 0 && checked.size === messages.length;

  return (
    <ul className="animate-fade-in divide-y-2 divide-line">
      {onCheckAll && (
        <li className="flex items-center gap-2 bg-raised px-3 py-1.5">
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
        const external = isExternalSender(
          message.from?.[0]?.email,
          ownDomain ?? null,
        );
        const count = threadCounts[message.threadId] ?? 1;
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
            className={`flex items-start gap-1 pl-2 transition-colors duration-[var(--dur-fast)] ease-smooth ${
              active ? "bg-tint" : "hover:bg-raised"
            }`}
          >
            {onCheck && (
              <input
                aria-label={`Select message from ${sender(message)}`}
                checked={checked?.has(message.id) ?? false}
                className="mt-4 size-4 shrink-0 accent-brand"
                onChange={(e) => onCheck(message.id, e.target.checked)}
                type="checkbox"
              />
            )}
            {onFlag ? (
              <button
                type="button"
                aria-label={flagged ? "Remove star" : "Star"}
                aria-pressed={flagged}
                onClick={() => onFlag(message, !flagged)}
                className="mt-3.5 shrink-0 rounded-[6px] p-1 text-subtle hover:text-brand"
              >
                {star}
              </button>
            ) : (
              <span className="mt-3.5 shrink-0 p-1 text-subtle">{star}</span>
            )}
            <button
              type="button"
              onClick={() => onSelect(message.id)}
              className="min-w-0 flex-1 py-3 pr-3 text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`flex min-w-0 items-center gap-1.5 truncate text-sm text-ink ${unread ? "font-extrabold" : "font-medium"}`}
                >
                  <span className="truncate">{sender(message)}</span>
                  {external && <ExternalTag />}
                  {count > 1 && (
                    <span className="text-xs font-bold text-subtle">
                      {count}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-subtle">
                  {message.hasAttachment && <Paperclip size={12} aria-hidden />}
                  {when(message.receivedAt)}
                </span>
              </div>
              <div
                className={`truncate text-sm ${unread ? "font-bold text-ink" : "text-subtle"}`}
              >
                {message.subject || "(no subject)"}
              </div>
              <div className="truncate text-xs text-subtle">
                {message.preview}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
