"use client";

import type { Mailbox } from "@/lib/mail/jmap-mail";

export function MailboxList({
  mailboxes,
  selected,
  onSelect,
}: {
  mailboxes: Mailbox[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 md:min-h-0 md:flex-col md:overflow-x-visible md:overflow-y-auto md:pb-0">
      {mailboxes.map((box) => {
        const active = box.id === selected;
        return (
          <button
            key={box.id}
            type="button"
            onClick={() => onSelect(box.id)}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-[10px] border-2 border-line px-3 py-2 text-left text-sm font-bold md:shrink ${
              active
                ? "bg-brand text-brand-ink shadow-brut-sm"
                : "bg-surface text-ink hover:bg-tint"
            }`}
          >
            <span className="truncate">{box.name}</span>
            {box.unreadEmails > 0 && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs transition-colors duration-[var(--dur-fast)] ease-smooth ${
                  active ? "bg-surface text-brand" : "bg-brand text-brand-ink"
                }`}
              >
                {box.unreadEmails}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
