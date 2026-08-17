"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Search } from "lucide-react";
import { fetchAllEvents, type EventRecord, type WithKey } from "@/lib/api";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import { sender, when } from "./mail/message-list";
import { SECTIONS, type Section } from "./sections";
import { useSession } from "./session";
import { flipTheme } from "@/components/theme-toggle";
import {
  buildPeople,
  fetchExecs,
  fetchPeopleSignups,
  searchPeople,
  type Person,
} from "./users/api";

const STORE = "admin.palette.recents";
const DEBOUNCE = 180;
const LIMIT = 5;
const STALE = 60_000;

const OPERATORS: [string, string][] = [
  ["from:", "messages from an address"],
  ["to:", "messages sent to an address"],
  ["subject:", "words in the subject line"],
  ["in:", "one folder only"],
  ["has:attachment", "messages carrying a file"],
  ["is:unread", "what you have not read yet"],
  ["is:starred", "messages you starred"],
];

type EventItem = WithKey<EventRecord>;

type Kind =
  | "Mail"
  | "Person"
  | "Event"
  | "Go to"
  | "Action"
  | "Search"
  | "Operator"
  | "Folder";

type Recent = { kind: Kind; id: string; label: string; hint?: string };

type Row = {
  key: string;
  kind: Kind;
  label: string;
  hint?: string;
  run: () => void;
  keep?: boolean;
  recent?: Recent;
  message?: MessageSummary;
};

type Group = { label: string; rows: Row[] };
type Action = { id: string; label: string; hint?: string; run: () => void };
type Data = { people: Person[]; events: EventItem[]; mailboxes: Mailbox[] };

export type Handoff = {
  person?: string;
  event?: EventItem;
  newEvent?: true;
  pending?: true;
  compose?: true;
  message?: MessageSummary;
};

const PaletteContext = createContext<{
  open: () => void;
  isOpen: boolean;
  handoff: Handoff;
  taken: () => void;
}>({ open: () => {}, isOpen: false, handoff: {}, taken: () => {} });

export const usePalette = () => useContext(PaletteContext);

/** Applies whatever the palette sent to this page, once. */
export function useHandoff<K extends keyof Handoff>(
  key: K,
  apply: (value: NonNullable<Handoff[K]>) => void,
) {
  const { handoff, taken } = usePalette();
  useEffect(() => {
    const value = handoff[key];
    if (!value) return;
    apply(value as NonNullable<Handoff[K]>);
    taken();
  }, [handoff, key, apply, taken]);
}

const readRecents = (): Recent[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(raw) ? (raw as Recent[]).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
};

const store = (entry: Recent) => {
  const next = [
    entry,
    ...readRecents().filter(
      (item) => item.kind !== entry.kind || item.id !== entry.id,
    ),
  ].slice(0, LIMIT);
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    return;
  }
};

const replaceLast = (value: string, insert: string) =>
  value.replace(/(^|\s)\S*$/, (_, space: string) => `${space}${insert}`);

const asTerm = (name: string) => (name.includes(" ") ? `"${name}"` : name);

const details = (values: (string | undefined)[]) =>
  values.filter(Boolean).join(" · ");

const ROW =
  "relative z-10 block w-full animate-rise-in rounded-[10px] px-3 py-2 text-left";

const BADGE =
  "shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-ink";

export function PaletteProvider({
  hasMail,
  onLogout,
  children,
}: {
  hasMail: boolean;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>({});
  const [data, setData] = useState<Data | null>(null);
  const fetchedAt = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!isOpen || Date.now() - fetchedAt.current < STALE) return;
    fetchedAt.current = Date.now();
    const people: Promise<Person[]> = user?.isApprover
      ? Promise.all([fetchExecs(), fetchPeopleSignups()])
          .then(([execs, signups]) => buildPeople(execs, signups))
          .catch(() => [])
      : Promise.resolve([]);
    const mailboxes: Promise<Mailbox[]> = hasMail
      ? fetch("/api/mail/mailboxes")
          .then((res) => (res.ok ? (res.json() as Promise<Mailbox[]>) : []))
          .catch(() => [])
      : Promise.resolve([]);
    void Promise.all([
      people,
      fetchAllEvents().catch((): EventItem[] => []),
      mailboxes,
    ]).then(([people, events, mailboxes]) =>
      setData({ people, events, mailboxes }),
    );
  }, [isOpen, user?.isApprover, hasMail]);

  const send = useCallback(
    (href: string, next: Handoff) => {
      setHandoff(next);
      setIsOpen(false);
      router.push(href);
    },
    [router],
  );

  const places = useMemo<Section[]>(
    () => [
      ...SECTIONS.filter(
        (section) =>
          (!section.approverOnly || user?.isApprover) &&
          (!section.execOnly || user?.isExecutive) &&
          (!section.mailboxOnly || hasMail),
      ),
    ],
    [user?.isApprover, user?.isExecutive, hasMail],
  );

  const actions = useMemo<Action[]>(
    () => [
      ...(hasMail
        ? [
            {
              id: "compose",
              label: "Compose mail",
              hint: "start a new message",
              run: () => send("/admin/mail", { compose: true }),
            },
          ]
        : []),
      ...(user?.isExecutive
        ? [
            {
              id: "new-event",
              label: "New event",
              hint: "publish something to the site",
              run: () => send("/admin/events", { newEvent: true }),
            },
          ]
        : []),
      ...(user?.isApprover
        ? [
            {
              id: "pending",
              label: "Pending sign-ups",
              hint: "review who is waiting",
              run: () => send("/admin/users", { pending: true }),
            },
          ]
        : []),
      {
        id: "site",
        label: "Open the public site",
        hint: "in a new tab",
        run: () => window.open("/", "_blank", "noopener"),
      },
      { id: "theme", label: "Toggle dark mode", run: flipTheme },
      { id: "logout", label: "Log out", run: onLogout },
    ],
    [hasMail, user?.isApprover, user?.isExecutive, send, onLogout],
  );

  const value = useMemo(
    () => ({
      open: () => setIsOpen(true),
      isOpen,
      handoff,
      taken: () => setHandoff({}),
    }),
    [isOpen, handoff],
  );

  return (
    <PaletteContext.Provider value={value}>
      {children}
      {isOpen && (
        <Palette
          actions={actions}
          data={data}
          hasMail={hasMail}
          onClose={() => setIsOpen(false)}
          onSend={send}
          places={places}
        />
      )}
    </PaletteContext.Provider>
  );
}

export function SearchButton() {
  const { open } = usePalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search everything"
      title="Search everything"
      className="flex items-center gap-2 rounded-[10px] border-2 border-line px-2.5 py-1.5 text-sm font-bold text-subtle hover:bg-tint"
    >
      <Search size={15} aria-hidden />
      <kbd className="hidden text-[11px] font-bold sm:block">⌘K</kbd>
    </button>
  );
}

function Palette({
  actions,
  data,
  hasMail,
  places,
  onClose,
  onSend,
}: {
  actions: Action[];
  data: Data | null;
  hasMail: boolean;
  places: Section[];
  onClose: () => void;
  onSend: (href: string, handoff: Handoff) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState({
    query: "",
    messages: [] as MessageSummary[],
  });
  const [recents] = useState(readRecents);
  const [highlight, setHighlight] = useState(0);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);

  const query = text.trim();
  const needle = query.toLowerCase();
  const trailing = text.slice(text.lastIndexOf(" ") + 1).toLowerCase();
  const busy = hasMail && query !== "" && result.query !== query;
  const mailboxes = useMemo(() => data?.mailboxes ?? [], [data]);

  const retype = useCallback((next: string) => {
    setText(next);
    setHighlight(0);
    input.current?.focus();
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
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
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!hasMail || !query) return;
    const timer = setTimeout(async () => {
      const mine = ++ticket.current;
      let messages: MessageSummary[] = [];
      try {
        const res = await fetch(
          `/api/mail/messages?limit=${LIMIT}&search=${encodeURIComponent(query)}`,
        );
        const body = (await res.json()) as { messages?: MessageSummary[] };
        if (res.ok) messages = body.messages ?? [];
      } catch {
        messages = [];
      }
      if (mine !== ticket.current) return;
      setResult({ query, messages });
    }, DEBOUNCE);
    return () => clearTimeout(timer);
  }, [hasMail, query]);

  const rerun = useCallback(
    (recent: Recent) => {
      switch (recent.kind) {
        case "Action":
          actions.find((action) => action.id === recent.id)?.run();
          return;
        case "Search":
          retype(recent.id);
          return;
        case "Person":
          onSend("/admin/users", { person: recent.id });
          return;
        case "Event": {
          const event = data?.events.find((item) => item.$key === recent.id);
          onSend("/admin/events", event ? { event } : {});
          return;
        }
        default:
          onSend(recent.id, {});
      }
    },
    [actions, data, onSend, retype],
  );

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const matches = (...values: (string | undefined)[]) =>
      values.some((value) => value?.toLowerCase().includes(needle));

    if (!query && recents.length) {
      out.push({
        label: "Recent",
        rows: recents.map((item) => ({
          key: `recent:${item.kind}:${item.id}`,
          kind: item.kind,
          label: item.label,
          hint: item.hint,
          recent: item,
          keep: item.kind === "Search",
          run: () => rerun(item),
        })),
      });
    }

    if (hasMail && trailing) {
      const folder = /(?:^|\s)in:(\S*)$/.exec(text);
      const boxes = folder
        ? mailboxes
            .filter((box) =>
              box.name.toLowerCase().includes(folder[1].toLowerCase()),
            )
            .slice(0, LIMIT)
        : [];
      if (boxes.length) {
        out.push({
          label: "Folders",
          rows: boxes.map((box) => ({
            key: `folder:${box.id}`,
            kind: "Folder" as const,
            label: `in:${box.name}`,
            hint: `${box.totalEmails} messages`,
            keep: true,
            run: () => retype(replaceLast(text, `in:${asTerm(box.name)} `)),
          })),
        });
      }
      const tokens = OPERATORS.filter(
        ([token]) => token.startsWith(trailing) && token !== trailing,
      );
      if (tokens.length && !boxes.length) {
        out.push({
          label: "Operators",
          rows: tokens.map(([token, hint]) => ({
            key: `operator:${token}`,
            kind: "Operator" as const,
            label: token,
            hint,
            keep: true,
            run: () => retype(replaceLast(text, token)),
          })),
        });
      }
    }

    const commands = actions.filter(
      (action) => !query || matches(action.label),
    );
    if (commands.length) {
      out.push({
        label: "Actions",
        rows: commands.map((action) => ({
          key: `action:${action.id}`,
          kind: "Action" as const,
          label: action.label,
          hint: action.hint,
          recent: { kind: "Action", id: action.id, label: action.label },
          run: action.run,
        })),
      });
    }

    const going = places.filter((place) => !query || matches(place.name));
    if (going.length) {
      out.push({
        label: "Go to",
        rows: going.map((place) => ({
          key: `place:${place.href}`,
          kind: "Go to" as const,
          label: place.name,
          hint: place.blurb,
          recent: { kind: "Go to", id: place.href, label: place.name },
          run: () => onSend(place.href, {}),
        })),
      });
    }

    if (query && result.messages.length) {
      out.push({
        label: "Mail",
        rows: result.messages.map((message) => ({
          key: `mail:${message.id}`,
          kind: "Mail" as const,
          label: message.subject || "(no subject)",
          message,
          recent: { kind: "Search", id: query, label: query },
          run: () => onSend("/admin/mail", { message }),
        })),
      });
    }

    if (query && data?.people.length) {
      const people = searchPeople(data.people, query).slice(0, LIMIT);
      if (people.length) {
        out.push({
          label: "People",
          rows: people.map((person) => ({
            key: `person:${person.id}`,
            kind: "Person" as const,
            label: person.name,
            hint: details([
              person.title,
              person.username,
              person.email,
              person.status ?? "no account",
            ]),
            recent: { kind: "Person", id: person.id, label: person.name },
            run: () => onSend("/admin/users", { person: person.id }),
          })),
        });
      }
    }

    if (query && data?.events.length) {
      const events = data.events
        .filter((event) =>
          matches(event.title, event.presenter, event.location),
        )
        .slice(0, LIMIT);
      if (events.length) {
        out.push({
          label: "Events",
          rows: events.map((event) => ({
            key: `event:${event.$key}`,
            kind: "Event" as const,
            label: event.title || "Untitled event",
            hint: details([event.presenter, event.location]),
            recent: {
              kind: "Event",
              id: event.$key,
              label: event.title || "Untitled event",
            },
            run: () => onSend("/admin/events", { event }),
          })),
        });
      }
    }

    return out;
  }, [
    actions,
    data,
    hasMail,
    mailboxes,
    needle,
    onSend,
    places,
    query,
    recents,
    rerun,
    result,
    retype,
    text,
    trailing,
  ]);

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const index = highlight < rows.length ? highlight : 0;
  const active = rows[index];

  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(
      `[data-row="${index}"]`,
    );
    if (!active || !row) return setBar(null);
    setBar({ top: row.offsetTop, height: row.offsetHeight });
    row.scrollIntoView({ block: "nearest" });
  }, [active, index]);

  const pick = (row: Row) => {
    if (row.recent) store(row.recent);
    row.run();
    if (!row.keep) onClose();
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
      if (active) pick(active);
    }
  };

  return (
    <div
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex animate-fade-in justify-center bg-ink/40 sm:p-6 sm:pt-[11vh]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the admin portal"
        className="flex h-dvh w-full animate-pop-in flex-col overflow-hidden border-line bg-surface sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-[20px] sm:border-2 sm:shadow-brut"
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-brand" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={text}
            onChange={(event) => retype(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search the admin portal"
            placeholder="Search mail, people and events — or run a command"
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
          aria-label="Results"
          className="relative min-h-0 flex-1 overflow-y-auto p-2"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 rounded-[10px] bg-tint transition-[transform,opacity] duration-[var(--dur-fast)] ease-smooth"
            style={{
              transform: `translateY(${bar?.top ?? 0}px)`,
              height: bar?.height ?? 0,
              opacity: bar ? 1 : 0,
            }}
          />

          {rows.length === 0 && (
            <p className="px-3 py-12 text-center text-sm text-subtle">
              {busy
                ? "Looking…"
                : `Nothing matches “${query}”. Try fewer words.`}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-subtle uppercase">
                {group.label}
              </p>
              {group.rows.map((row) => {
                const at = rows.indexOf(row);
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="option"
                    aria-selected={at === index}
                    data-row={at}
                    onMouseEnter={() => setHighlight(at)}
                    onClick={() => pick(row)}
                    style={{ animationDelay: `${Math.min(at, 8) * 20}ms` }}
                    className={ROW}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={BADGE}>{row.kind}</span>
                      <span className="min-w-0 flex-1">
                        {row.message ? (
                          <Hit message={row.message} mailboxes={mailboxes} />
                        ) : (
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-bold text-ink">
                              {row.label}
                            </span>
                            {row.hint && (
                              <span className="truncate text-xs text-subtle">
                                {row.hint}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="hidden shrink-0 gap-4 border-t-2 border-line px-4 py-2 text-[11px] font-bold text-subtle sm:flex">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>tab completes a mail operator</span>
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
