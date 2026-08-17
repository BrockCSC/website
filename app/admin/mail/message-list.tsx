"use client";

import { Paperclip, Star } from "lucide-react";
import type { MessageSummary } from "@/lib/mail/jmap-mail";

const sender = (message: MessageSummary) => {
  const from = message.from?.[0];
  return from?.name || from?.email || "Unknown sender";
};

const when = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function MessageList({
  messages,
  selected,
  threadCounts,
  onSelect,
  onFlag,
}: {
  messages: MessageSummary[];
  selected: string | null;
  threadCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onFlag: (message: MessageSummary, flagged: boolean) => void;
}) {
  if (messages.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-subtle">
        Nothing here yet.
      </p>
    );
  }

  return (
    <ul className="divide-y-2 divide-line">
      {messages.map((message) => {
        const unread = !message.keywords?.$seen;
        const flagged = Boolean(message.keywords?.$flagged);
        const active = message.id === selected;
        const count = threadCounts[message.threadId] ?? 1;
        return (
          <li
            key={message.id}
            data-message={message.id}
            className={`flex items-start gap-1 pl-2 transition ${
              active ? "bg-tint" : "hover:bg-raised"
            }`}
          >
            <button
              type="button"
              aria-label={flagged ? "Remove star" : "Star"}
              aria-pressed={flagged}
              onClick={() => onFlag(message, !flagged)}
              className="mt-3.5 shrink-0 rounded-[6px] p-1 text-subtle transition hover:text-brand"
            >
              <Star
                size={15}
                className={flagged ? "fill-brand text-brand" : ""}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => onSelect(message.id)}
              className="min-w-0 flex-1 py-3 pr-3 text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`truncate text-sm text-ink ${unread ? "font-extrabold" : "font-medium"}`}
                >
                  {sender(message)}
                  {count > 1 && (
                    <span className="ml-1.5 text-xs font-bold text-subtle">
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
