"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { sender, when } from "./message-list";
import type { Contact } from "./recipient-input";

const RECENTS = "mail.recent-searches";
const DEBOUNCE = 180;

const OPERATORS: [string, string][] = [
  ["from:", "messages from an address"],
  ["to:", "messages sent to an address"],
  ["subject:", "words in the subject line"],
  ["in:", "one folder only"],
  ["has:attachment", "messages carrying a file"],
  ["is:unread", "what you have not read yet"],
  ["is:starred", "messages you starred"],
];

type Row =
  | { kind: "message"; message: MessageSummary }
  | {
      kind: "insert";
      label: string;
      hint: string;
      apply: string;
      whole?: true;
    };

type Group = { label: string; rows: Row[] };

const recentSearches = (): string[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENTS) ?? "[]");
    return Array.isArray(raw) ? (raw as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
};

const remember = (value: string) => {
  const next = [
    value,
    ...recentSearches().filter((item) => item !== value),
  ].slice(0, 5);
  try {
    localStorage.setItem(RECENTS, JSON.stringify(next));
  } catch {
    return;
  }
};

const replaceLast = (value: string, insert: string) =>
  value.replace(/(^|\s)\S*$/, (_, space: string) => `${space}${insert}`);

const asTerm = (name: string) => (name.includes(" ") ? `"${name}"` : name);

const ROW =
  "relative z-10 block w-full rounded-[10px] px-3 py-2 text-left transition duration-200 ease-smooth motion-reduce:transition-none";

export function SearchPalette({
  mailboxes,
  contacts,
  onClose,
  onOpen,
}: {
  mailboxes: Mailbox[];
  contacts: Contact[];
  onClose: () => void;
  onOpen: (message: MessageSummary) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState({
    query: "",
    messages: [] as MessageSummary[],
  });
  const [recents] = useState(recentSearches);
  const [highlight, setHighlight] = useState(0);
  const [shown, setShown] = useState(false);
  const [staged, setStaged] = useState(false);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);

  const query = text.trim();
  const trailing = text.slice(text.lastIndexOf(" ") + 1).toLowerCase();
  const busy = query !== "" && result.query !== query;

  const retype = (next: string) => {
    setText(next);
    setHighlight(0);
    setStaged(false);
    input.current?.focus();
  };

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setShown(true));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (
        event.key === "Tab" &&
        document.activeElement !== input.current
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(async () => {
      const mine = ++ticket.current;
      let messages: MessageSummary[] = [];
      try {
        const res = await fetch(
          `/api/mail/messages?limit=8&search=${encodeURIComponent(query)}`,
        );
        const data = (await res.json()) as { messages?: MessageSummary[] };
        if (res.ok) messages = data.messages ?? [];
      } catch {
        messages = [];
      }
      if (mine !== ticket.current) return;
      setResult({ query, messages });
      setStaged(false);
    }, DEBOUNCE);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = useMemo<Group[]>(() => {
    if (!query) {
      return [
        ...(recents.length
          ? [
              {
                label: "Recent searches",
                rows: recents.map<Row>((item) => ({
                  kind: "insert",
                  label: item,
                  hint: "search again",
                  apply: item,
                  whole: true,
                })),
              },
            ]
          : []),
        {
          label: "Operators",
          rows: OPERATORS.map<Row>(([token, hint]) => ({
            kind: "insert",
            label: token,
            hint,
            apply: token,
          })),
        },
      ];
    }

    const out: Group[] = [];
    const folder = /(?:^|\s)in:(\S*)$/.exec(text);
    if (folder) {
      const term = folder[1].toLowerCase();
      const boxes = mailboxes
        .filter((box) => box.name.toLowerCase().includes(term))
        .slice(0, 5);
      if (boxes.length) {
        out.push({
          label: "Folders",
          rows: boxes.map<Row>((box) => ({
            kind: "insert",
            label: `in:${box.name}`,
            hint: `${box.totalEmails} messages`,
            apply: `in:${asTerm(box.name)} `,
          })),
        });
      }
    }

    if (result.messages.length) {
      out.push({
        label: "Messages",
        rows: result.messages.map<Row>((message) => ({
          kind: "message",
          message,
        })),
      });
    }

    const people =
      trailing && !trailing.includes(":")
        ? contacts
            .filter(
              (contact) =>
                contact.name.toLowerCase().includes(trailing) ||
                contact.email.toLowerCase().includes(trailing),
            )
            .slice(0, 3)
        : [];
    if (people.length) {
      out.push({
        label: "People",
        rows: people.map<Row>((contact) => ({
          kind: "insert",
          label: contact.name,
          hint: `mail from ${contact.email}`,
          apply: `from:${contact.email} `,
        })),
      });
    }
    return out;
  }, [query, text, trailing, recents, result, contacts, mailboxes]);

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const index = highlight < rows.length ? highlight : 0;
  const active = rows[index];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setStaged(true));
    return () => cancelAnimationFrame(frame);
  }, [rows]);

  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(
      `[data-row="${index}"]`,
    );
    if (!active || !row) return setBar(null);
    setBar({ top: row.offsetTop, height: row.offsetHeight });
    row.scrollIntoView({ block: "nearest" });
  }, [active, index]);

  const apply = (row: Row) => {
    if (row.kind === "message") {
      remember(query);
      onOpen(row.message);
      onClose();
      return;
    }
    retype(row.whole ? row.apply : replaceLast(text, row.apply));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!rows.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index + step + rows.length) % rows.length);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const match = OPERATORS.find(
        ([token]) =>
          trailing && token.startsWith(trailing) && token !== trailing,
      );
      if (match) retype(replaceLast(text, match[0]));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active) apply(active);
    }
  };

  return (
    <div
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      className={`fixed inset-0 z-50 flex justify-center bg-ink/40 transition-opacity duration-200 ease-smooth motion-reduce:transition-none sm:p-6 sm:pt-[11vh] ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search all mail"
        className={`flex h-dvh w-full flex-col overflow-hidden border-line bg-surface transition duration-200 ease-smooth motion-reduce:transition-none sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-[20px] sm:border-2 sm:shadow-brut ${
          shown
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-brand" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={text}
            onChange={(event) => retype(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search all mail"
            placeholder="Search every folder — try from:, in:, is:unread"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none"
          />
          {busy && (
            <Loader2
              size={15}
              className="shrink-0 animate-spin text-subtle"
              aria-hidden
            />
          )}
          <kbd className="hidden shrink-0 rounded-[6px] border-2 border-line px-1.5 py-0.5 text-[10px] font-bold text-subtle sm:block">
            esc
          </kbd>
        </div>

        <div
          ref={list}
          role="listbox"
          aria-label="Search results"
          className="relative min-h-0 flex-1 overflow-y-auto p-2"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 rounded-[10px] bg-tint transition-[transform,opacity] duration-150 ease-smooth motion-reduce:transition-none"
            style={{
              transform: `translateY(${bar?.top ?? 0}px)`,
              height: bar?.height ?? 0,
              opacity: bar ? 1 : 0,
            }}
          />

          {rows.length === 0 && (
            <p className="px-3 py-12 text-center text-sm text-subtle">
              {busy
                ? "Looking through every folder…"
                : `Nothing in any folder matches “${query}”. Try fewer words, or drop an operator.`}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-subtle uppercase">
                {group.label}
              </p>
              {group.rows.map((row) => {
                const at = rows.indexOf(row);
                const key = row.kind === "message" ? row.message.id : row.label;
                return (
                  <button
                    key={`${group.label}:${key}`}
                    type="button"
                    role="option"
                    aria-selected={at === index}
                    data-row={at}
                    onMouseEnter={() => setHighlight(at)}
                    onClick={() => apply(row)}
                    style={{ transitionDelay: `${Math.min(at, 8) * 20}ms` }}
                    className={`${ROW} ${
                      staged
                        ? "translate-y-0 opacity-100"
                        : "translate-y-1 opacity-0"
                    }`}
                  >
                    {row.kind === "message" ? (
                      <Hit message={row.message} mailboxes={mailboxes} />
                    ) : (
                      <span className="flex items-baseline gap-2">
                        <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">
                          {row.label}
                        </span>
                        <span className="truncate text-xs text-subtle">
                          {row.hint}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="hidden shrink-0 gap-4 border-t-2 border-line px-4 py-2 text-[11px] font-bold text-subtle sm:flex">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>tab completes an operator</span>
        </p>
      </div>
    </div>
  );
}

function Hit({
  message,
  mailboxes,
}: {
  message: MessageSummary;
  mailboxes: Mailbox[];
}) {
  const folder = mailboxes.find((box) => message.mailboxIds?.[box.id])?.name;
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-bold text-ink">
          {message.subject || "(no subject)"}
        </span>
        <span className="shrink-0 text-xs text-subtle">
          {when(message.receivedAt)}
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="shrink-0 truncate text-xs font-bold text-brand">
          {sender(message)}
        </span>
        <span className="truncate text-xs text-subtle">{message.preview}</span>
      </span>
      {folder && (
        <span className="mt-1 inline-block rounded-full border-2 border-line px-2 text-[10px] font-bold text-ink">
          {folder}
        </span>
      )}
    </>
  );
}
