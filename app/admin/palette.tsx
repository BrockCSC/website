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
import {
  ArrowRight,
  Calendar,
  Folder,
  Hash,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  Search,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { fetchAllEvents, type EventRecord, type WithKey } from "@/lib/api";
import { storedTerms } from "@/lib/execs/terms";
import type { Mailbox, MessageSummary } from "@/lib/mail/jmap-mail";
import type { Inbox } from "@/app/api/mail/inboxes/route";
import { Sheet } from "@/components/ui/sheet";
import { navigateStack } from "@/lib/use-stack-param";
import { usePhone } from "@/lib/use-media-query";
import { fetchInboxes, matchesInbox, withAs } from "./mail/inbox-picker";
import { sender, when } from "./mail/message-list";
import { visibleSections, type Section } from "./sections";
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

/** The palette's <dialog> id: global shortcuts skip `dialog[open]:not(#admin-palette)`. */
export const PALETTE_DIALOG_ID = "admin-palette";

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
  | "Inbox"
  | "Event"
  | "Go to"
  | "Action"
  | "Search"
  | "Operator"
  | "Folder";

/** Shown in place of the kind badge in "Recent" below sm. */
const KIND_ICONS: Record<Kind, LucideIcon> = {
  Mail: Mail,
  Person: User,
  Inbox: InboxIcon,
  Event: Calendar,
  "Go to": ArrowRight,
  Action: Zap,
  Search: Search,
  Operator: Hash,
  Folder: Folder,
};

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
type Data = {
  people: Person[];
  events: EventItem[];
  mailboxes: Mailbox[];
  inboxes: Inbox[];
};

/**
 * Intents the palette hands to the page it opens. Screens are URLs now
 * (`?person=`, `?event=`, `?m=`, `?compose=`, spec D4). `pending` and
 * `pickInbox` stay; `person`, `event` and `newEvent` ride along with their URL
 * until the users and events pages read it (LEGACY_HANDOFF).
 */
export type Handoff = {
  /** Sent with `/admin/users?person=ID` (LEGACY_HANDOFF). */
  person?: string;
  /** Sent with `/admin/events?event=KEY` (LEGACY_HANDOFF). */
  event?: EventItem;
  /** Sent with `/admin/events?event=new` (LEGACY_HANDOFF). */
  newEvent?: true;
  pending?: true;
  /** @deprecated Never sent: jumps go to `/admin/mail?compose=new`. */
  compose?: true;
  pickInbox?: true;
  /** @deprecated Never sent: jumps go to `/admin/mail?m=ID`. */
  message?: MessageSummary;
};

type Send = (href: string, handoff?: Handoff) => void;

const PaletteContext = createContext<{
  open: () => void;
  isOpen: boolean;
  handoff: Handoff;
  taken: () => void;
  /** Close the palette and go to `href` (stack params through navigateStack). */
  send: Send;
}>({
  open: () => {},
  isOpen: false,
  handoff: {},
  taken: () => {},
  send: () => {},
});

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

/** Stack params (spec D4): a jump that sets one goes through navigateStack. */
const STACK_KEYS = ["m", "compose", "event", "person"];

/**
 * The users and events pages still open their screens from these handoffs,
 * not yet from `?person=` / `?event=`. Sent next to the URL until they read
 * it (spec D4); a page that reads the URL ignores them.
 */
const LEGACY_HANDOFF = {
  person: (person: string): Handoff => ({ person }),
  event: (event: EventItem): Handoff => ({ event }),
  newEvent: (): Handoff => ({ newEvent: true }),
};

const ROW =
  "relative z-10 block w-full animate-rise-in rounded-[10px] px-3 py-2 text-left pointer-coarse:min-h-11 max-sm:min-h-12 max-sm:py-2.5";

const BADGE =
  "shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-ink max-sm:hidden";

export function PaletteProvider({
  hasMail,
  onLogout,
  children,
}: {
  hasMail: boolean | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [handoff, setHandoff] = useState<Handoff>({});
  const [data, setData] = useState<Data | null>(null);
  const fetchedAt = useRef(0);
  const [afterClose, setAfterClose] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      // Another dialog owns the keyboard (compose's Cmd-K inserts a link).
      if (document.querySelector(`dialog[open]:not(#${PALETTE_DIALOG_ID})`))
        return;
      event.preventDefault();
      openPalette();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

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
      user?.isMailAdmin ? fetchInboxes().catch((): Inbox[] => []) : [],
    ]).then(([people, events, mailboxes, inboxes]) =>
      setData({ people, events, mailboxes, inboxes }),
    );
  }, [isOpen, user?.isApprover, user?.isMailAdmin, hasMail]);

  const close = useCallback(() => setIsOpen(false), []);

  const send = useCallback<Send>(
    (href, next) => {
      if (next) setHandoff(next);
      const url = new URL(href, window.location.href);
      const stack = STACK_KEYS.some((key) => url.searchParams.has(key));
      setIsOpen(false);
      if (!stack) {
        router.push(href);
      } else if (isOpen) {
        // Wait until the palette has closed, so the screen the param opens
        // can take focus (the page is inert until then). Another page's
        // screen takes it when it mounts (useStackParam, recentJump).
        setAfterClose(href);
      } else {
        navigateStack(href, router);
      }
    },
    [isOpen, router],
  );

  // After the exit animation: a fresh palette next time, then any deferred
  // same-page jump.
  const onExited = useCallback(() => {
    setSession((count) => count + 1);
    if (!afterClose) return;
    setAfterClose(null);
    navigateStack(afterClose, router);
  }, [afterClose, router]);

  const places = useMemo<Section[]>(
    () =>
      visibleSections(
        {
          isApprover: user?.isApprover,
          isExecutive: user?.isExecutive,
          isMailAdmin: user?.isMailAdmin,
        },
        hasMail,
      ),
    [user?.isApprover, user?.isExecutive, user?.isMailAdmin, hasMail],
  );

  const actions = useMemo<Action[]>(
    () => [
      ...(hasMail !== false
        ? [
            {
              id: "compose",
              label: "Compose mail",
              hint: "start a new message",
              run: () => send("/admin/mail?compose=new"),
            },
          ]
        : []),
      ...(user?.isExecutive
        ? [
            {
              id: "new-event",
              label: "New event",
              hint: "publish something to the site",
              run: () =>
                send("/admin/events?event=new", LEGACY_HANDOFF.newEvent()),
            },
          ]
        : []),
      ...(user?.isMailAdmin
        ? [
            {
              id: "read-inbox",
              label: "Read another inbox",
              hint: "open any club inbox, read-only",
              run: () => send("/admin/mail", { pickInbox: true }),
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
        run: () => window.open("/site", "_blank", "noopener"),
      },
      { id: "theme", label: "Toggle dark mode", run: flipTheme },
      { id: "logout", label: "Log out", run: onLogout },
    ],
    [
      hasMail,
      user?.isApprover,
      user?.isExecutive,
      user?.isMailAdmin,
      send,
      onLogout,
    ],
  );

  const value = useMemo(
    () => ({
      open: openPalette,
      isOpen,
      handoff,
      taken: () => setHandoff({}),
      send,
    }),
    [openPalette, isOpen, handoff, send],
  );

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <Sheet
        id={PALETTE_DIALOG_ID}
        open={isOpen}
        onClose={close}
        onExited={onExited}
        title="Search the admin portal"
        hideTitle
        bare
        presentation="full"
        desktop="top-card"
        desktopClassName="desk:mt-[11vh] desk:w-[calc(100%-3rem)] desk:max-w-2xl desk:max-h-[70vh]"
        initialFocus={input}
      >
        <Palette
          key={session}
          actions={actions}
          data={data}
          hasMail={hasMail}
          inputRef={input}
          onClose={close}
          onSend={send}
          places={places}
        />
      </Sheet>
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
      className="inline-flex h-9 items-center gap-1 rounded-[10px] border-2 border-line px-2 text-sm font-bold text-subtle hover:bg-tint pointer-coarse:h-11 desk:px-3 phone:size-11 phone:justify-center phone:border-0 phone:px-0 phone:text-ink phone:press-flat"
    >
      <Search size={15} aria-hidden className="phone:size-5" />
      <kbd className="hidden text-[11px] font-bold desk:block">⌘K</kbd>
    </button>
  );
}

function Palette({
  actions,
  data,
  hasMail,
  inputRef,
  places,
  onClose,
  onSend,
}: {
  actions: Action[];
  data: Data | null;
  hasMail: boolean | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  places: Section[];
  onClose: () => void;
  onSend: Send;
}) {
  const phone = usePhone();
  const [text, setText] = useState("");
  const [result, setResult] = useState({
    query: "",
    messages: [] as MessageSummary[],
  });
  const [recents] = useState(readRecents);
  const [highlight, setHighlight] = useState(0);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);

  const query = text.trim();
  const needle = query.toLowerCase();
  const trailing = text.slice(text.lastIndexOf(" ") + 1).toLowerCase();
  const busy = hasMail && query !== "" && result.query !== query;
  const mailboxes = useMemo(() => data?.mailboxes ?? [], [data]);

  const retype = useCallback(
    (next: string) => {
      setText(next);
      setHighlight(0);
      inputRef.current?.focus();
    },
    [inputRef],
  );

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
          onSend(
            `/admin/users?person=${encodeURIComponent(recent.id)}`,
            LEGACY_HANDOFF.person(recent.id),
          );
          return;
        case "Event": {
          const event = data?.events.find((item) => item.$key === recent.id);
          onSend(
            `/admin/events?event=${encodeURIComponent(recent.id)}`,
            event ? LEGACY_HANDOFF.event(event) : undefined,
          );
          return;
        }
        default:
          onSend(recent.id);
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
          run: () => onSend(place.href),
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
          // The search runs over your own inbox, so the jump opens it there.
          run: () => onSend(`/admin/mail?m=${encodeURIComponent(message.id)}`),
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
              // Every term is searchable, so list them all: a hit on an older year is otherwise unexplained.
              person.exec ? storedTerms(person.exec).join(", ") : undefined,
              person.username,
              person.email,
              person.status ?? "no account",
            ]),
            recent: { kind: "Person", id: person.id, label: person.name },
            run: () =>
              onSend(
                `/admin/users?person=${encodeURIComponent(person.id)}`,
                LEGACY_HANDOFF.person(person.id),
              ),
          })),
        });
      }
    }

    if (query && data?.inboxes.length) {
      const inboxes = data.inboxes
        .filter((inbox) => matchesInbox(inbox, needle))
        .slice(0, LIMIT);
      if (inboxes.length) {
        out.push({
          label: "Inboxes",
          rows: inboxes.map((inbox) => {
            const href = withAs("/admin/mail", inbox.username);
            const label = `${inbox.name}’s inbox`;
            return {
              key: `inbox:${inbox.username}`,
              kind: "Inbox" as const,
              label,
              hint: inbox.address,
              recent: { kind: "Inbox", id: href, label },
              run: () => onSend(href),
            };
          }),
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
            run: () =>
              onSend(
                `/admin/events?event=${encodeURIComponent(event.$key)}`,
                LEGACY_HANDOFF.event(event),
              ),
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
      // Tab completes a mail operator; otherwise it moves focus as usual.
      const match = OPERATORS.find(
        ([token]) =>
          trailing && token.startsWith(trailing) && token !== trailing,
      );
      if (!match) return;
      event.preventDefault();
      retype(replaceLast(text, match[0]));
    } else if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (active) pick(active);
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-line desk:px-4 desk:pt-[max(0.75rem,env(safe-area-inset-top))] desk:pb-3 phone:min-h-[calc(3.5rem+env(safe-area-inset-top))] phone:pt-[env(safe-area-inset-top)] phone:pr-[max(0.5rem,env(safe-area-inset-right))] phone:pl-[max(1rem,env(safe-area-inset-left))]">
        <Search size={16} className="shrink-0 text-brand" aria-hidden />
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => retype(event.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="admin-palette-results"
          aria-activedescendant={
            active ? `admin-palette-row-${index}` : undefined
          }
          aria-label="Search the admin portal"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            phone
              ? "Search or jump to…"
              : "Search mail, people and events — or run a command"
          }
          className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-subtle focus:outline-none pointer-coarse:min-h-11 pointer-fine:text-sm"
        />
        {busy && (
          <Loader2
            size={15}
            className="shrink-0 animate-spin text-subtle"
            aria-hidden
          />
        )}
        <kbd className="hidden shrink-0 rounded-[6px] border-2 border-line px-1.5 py-0.5 text-[10px] font-bold text-subtle desk:block">
          esc
        </kbd>
        <button
          type="button"
          onClick={onClose}
          className="press-flat min-h-11 shrink-0 rounded-[10px] px-2 font-bold text-ink desk:hidden"
        >
          Cancel
        </button>
      </div>

      <div
        ref={list}
        id="admin-palette-results"
        role="listbox"
        aria-label="Results"
        data-scroll-allow
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 phone:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
            {busy ? "Looking…" : `Nothing matches “${query}”. Try fewer words.`}
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <p className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-subtle uppercase">
              {group.label}
            </p>
            {group.rows.map((row) => {
              const at = rows.indexOf(row);
              const KindIcon = KIND_ICONS[row.kind];
              return (
                <button
                  key={row.key}
                  id={`admin-palette-row-${at}`}
                  type="button"
                  role="option"
                  aria-selected={at === index}
                  data-row={at}
                  onMouseEnter={() => setHighlight(at)}
                  onClick={() => pick(row)}
                  style={{ animationDelay: `${Math.min(at, 8) * 20}ms` }}
                  className={ROW}
                >
                  <span className="flex items-baseline gap-2 max-sm:items-center">
                    <span className={BADGE}>{row.kind}</span>
                    {group.label === "Recent" && (
                      <KindIcon
                        aria-hidden
                        className="size-4 shrink-0 text-subtle sm:hidden"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      {row.message ? (
                        <Hit message={row.message} mailboxes={mailboxes} />
                      ) : (
                        <span className="flex items-baseline gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-0">
                          <span className="truncate text-sm font-bold text-ink max-sm:text-base">
                            {row.label}
                          </span>
                          {row.hint && (
                            <span className="truncate text-xs text-subtle max-sm:text-sm">
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

      <p className="hidden shrink-0 gap-4 border-t-2 border-line px-4 py-2 text-[11px] font-bold text-subtle desk:flex">
        <span>↑↓ move</span>
        <span>↵ run</span>
        <span>tab completes a mail operator</span>
      </p>
    </>
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
        <span className="truncate text-sm font-bold text-ink max-sm:text-base">
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
        <span className="mt-1 inline-block rounded-full border-2 border-line px-2 text-[10px] font-bold text-ink max-sm:text-xs">
          {folder}
        </span>
      )}
    </>
  );
}
