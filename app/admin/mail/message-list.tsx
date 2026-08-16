"use client";

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
  onSelect,
}: {
  messages: MessageSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </p>
    );
  }

  return (
    <ul className="divide-y-2 divide-black">
      {messages.map((message) => {
        const unread = !message.keywords?.$seen;
        const active = message.id === selected;
        return (
          <li key={message.id}>
            <button
              type="button"
              onClick={() => onSelect(message.id)}
              className={`w-full px-4 py-3 text-left transition ${
                active ? "bg-[#fff1f0]" : "hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`truncate text-sm ${unread ? "font-extrabold" : "font-medium"}`}
                >
                  {sender(message)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {when(message.receivedAt)}
                </span>
              </div>
              <div
                className={`truncate text-sm ${unread ? "font-bold" : "text-neutral-700"}`}
              >
                {message.subject || "(no subject)"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {message.preview}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
