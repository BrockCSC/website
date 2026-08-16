"use client";

import type { Mailbox } from "@/lib/mail/jmap-mail";

const label = (box: Mailbox) => box.name;

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
    <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
      {mailboxes.map((box) => {
        const active = box.id === selected;
        return (
          <button
            key={box.id}
            type="button"
            onClick={() => onSelect(box.id)}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-[10px] border-2 border-black px-3 py-2 text-left text-sm font-bold transition md:shrink ${
              active
                ? "bg-[#9A4440] text-white shadow-[3px_3px_0_0_#000]"
                : "bg-white hover:bg-[#fff1f0]"
            }`}
          >
            <span>{label(box)}</span>
            {box.unreadEmails > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  active ? "bg-white text-[#9A4440]" : "bg-[#9A4440] text-white"
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
