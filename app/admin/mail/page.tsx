"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  Ellipsis,
  Eye,
  Forward as ForwardIcon,
  MailOpen,
  Reply as ReplyIcon,
  ReplyAll as ReplyAllIcon,
  Search,
  SquarePen,
  Star,
  Trash2,
} from "lucide-react";
import { logout } from "@/lib/api";
import type { MailDeletionRequest } from "@/lib/api/types";
import type {
  Mailbox,
  MessageDetail,
  MessageSummary,
} from "@/lib/mail/jmap-mail";
import { Fab } from "@/components/ui/fab";
import { dismissToast, toast } from "@/components/ui/toast";
import { useHideTabBar } from "@/lib/use-chrome-flag";
import {
  BELOW_LG,
  PHONE_QUERY,
  mediaMatches,
  usePhone,
} from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { cn } from "@/lib/utils";
import { useSession } from "../session";
import { useHandoff, usePalette } from "../palette";
import { useAdminMail, useTopBar } from "../chrome";
import { ask } from "../ask";
import { Allowance, AllowanceWarning, useAllowance } from "./allowance";
import { InboxPicker, useInboxes, withAs } from "./inbox-picker";
import { MailboxList } from "./mailbox-list";
import { MessageList, MessageListSkeleton } from "./message-list";
import { Conversation, RetryRow, type FitState } from "./message-view";
import { Compose, type Draft } from "./compose";
import { draftKey, flushDraft, loadDraft } from "./draft-store";
import { domainOf } from "./external";
import { buildQuote, harden } from "./html";
import type { Contact } from "./recipient-input";
import { MailboxesSheet, type MailboxesSheetMode } from "./mailboxes-sheet";
import {
  MessageMoreSheet,
  MessageToolbar,
  SelectionToolbar,
} from "./message-toolbar";
import { expandConversation, moveIds, type MoveTarget } from "./thread-move";
import { useMailSelection } from "./use-mail-selection";
import Link from "next/link";

const PAGE = 50;
/** Refresh on focus/visibility when the list is older than this. */
const STALE_MS = 30_000;

type Page = {
  /** The folder these messages belong to (null before the first load). */
  mailbox: string | null;
  messages: MessageSummary[];
  total: number;
  threadCounts: Record<string, number>;
};

const EMPTY: Page = { mailbox: null, messages: [], total: 0, threadCounts: {} };

const otherRecipients = (message: MessageSummary, self: string | null) =>
  (message.to ?? [])
    .map((address) => address.email)
    .filter((email) => email !== self && email !== message.from?.[0]?.email);

const KEYWORDS = { seen: "$seen", flagged: "$flagged" } as const;

type Flags = Partial<Record<keyof typeof KEYWORDS, boolean>>;

const withKeywords = <T extends MessageSummary>(
  message: T,
  flags: Flags,
): T => {
  const next = { ...message.keywords };
  for (const [name, on] of Object.entries(flags)) {
    const keyword = KEYWORDS[name as keyof typeof KEYWORDS];
    if (on) next[keyword] = true;
    else delete next[keyword];
  }
  return { ...message, keywords: next };
};

const inverse = (flags: Flags): Flags =>
  Object.fromEntries(Object.entries(flags).map(([key, on]) => [key, !on]));

type ComposeMode = NonNullable<Draft["mode"]>;
const REPLY_MODES = ["reply", "replyall", "fwd"] as const;

const EMPTY_DRAFT: Draft = { mode: "new", html: "" };

/**
 * A saved draft (the Drafts folder) as a compose seed: its recipients,
 * subject and body. The body comes from the body route, so it is the
 * sanitizer's output, hardened again for the editor. Its own remote images
 * load: it is the user's message.
 */
const draftSeed = async (id: string): Promise<Draft> => {
  const path = `/api/mail/messages/${encodeURIComponent(id)}`;
  const [detail, doc] = await Promise.all([
    fetch(path).then((res) =>
      res.ok ? (res.json() as Promise<MessageDetail>) : Promise.reject(),
    ),
    fetch(`${path}/body?images=1`).then((res) =>
      res.ok ? res.text() : Promise.reject(),
    ),
  ]);
  const parsed = new DOMParser().parseFromString(doc, "text/html");
  harden(parsed.body);
  const emails = (list: MessageDetail["to"]) =>
    (list ?? []).map((address) => address.email).filter(Boolean);
  const cc = emails(detail.cc);
  return {
    to: emails(detail.to),
    ...(cc.length ? { cc } : {}),
    subject: detail.subject ?? "",
    html: parsed.body.innerHTML.trim(),
    quoting: false,
    mode: "new",
  };
};

const BUTTON =
  "rounded-[10px] border-2 border-line bg-brand px-4 py-2 font-bold text-brand-ink shadow-brut-sm hover:opacity-90";

const TOP_ICON =
  "press-flat grid size-11 shrink-0 place-items-center rounded-[10px] text-ink";

/** Runs `fn` once no <dialog> is open (a toast under the top layer would be hidden and paused). */
const afterDialogs = (fn: () => void) => {
  let tries = 0;
  const tick = () => {
    if (!document.querySelector("dialog[open]") || ++tries > 90) fn();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const focusQuietly = (el: HTMLElement) => {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
  }
  el.focus({ preventScroll: true });
};

/**
 * Moves focus once the stack hook's own rAF focus and any closing sheet's
 * returnFocus have run: waits out open dialogs, then one more frame.
 */
const focusLater = (pick: () => HTMLElement | null) =>
  afterDialogs(() =>
    requestAnimationFrame(() => {
      const target = pick();
      if (target) focusQuietly(target);
    }),
  );

const isShown = (el: Element | null | undefined): el is HTMLElement =>
  el instanceof HTMLElement && el.getClientRects().length > 0;

/**
 * After rows left the list: the row that slid into the first removed slot,
 * else the last row, else the list's title button (so focus never drops to
 * <body> when the pressed button or the open message goes away).
 */
const focusListAt = (index: number) =>
  focusLater(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        "li[data-message] button[data-stack-return]",
      ),
    ].filter(isShown);
    const title = [
      ...document.querySelectorAll<HTMLElement>("[data-mail-title]"),
    ].find(isShown);
    return rows[Math.max(0, index)] ?? rows.at(-1) ?? title ?? null;
  });

/**
 * The text of the toast on screen (one shows at a time, the rest queue), or
 * null when none is.
 */
const shownToast = () =>
  document.querySelector(
    'section[aria-label="Notifications"] p[aria-hidden="true"]',
  )?.textContent ?? null;

/**
 * After a keyboard action, put the sequential focus starting point on the
 * toast region, so the next Tab reaches its Undo (spec D17).
 */
const pointTabAtToast = () =>
  requestAnimationFrame(() => {
    const region = document.querySelector<HTMLElement>(
      'section[aria-label="Notifications"]',
    );
    if (!region) return;
    if (!region.hasAttribute("tabindex")) region.setAttribute("tabindex", "-1");
    region.style.outline = "none";
    region.focus({ preventScroll: true });
  });

const updatedLabel = (ms: number) =>
  ms < 60_000
    ? "Updated just now"
    : ms < 3_600_000
      ? `Updated ${Math.round(ms / 60_000)} min ago`
      : `Updated ${Math.round(ms / 3_600_000)} h ago`;

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-3 phone:p-0">
          <span className="sr-only" role="status">
            Loading mail…
          </span>
          <MessageListSkeleton />
        </div>
      }
    >
      <Scoped />
    </Suspense>
  );
}

/** Mounts MailPage afresh per inbox. */
function Scoped() {
  const { user } = useSession();
  const params = useSearchParams();
  const viewing = (user?.isMailAdmin && params.get("as")) || null;
  const inboxes = useInboxes();
  const [picking, setPicking] = useState(false);
  // Phone: the palette's "Switch inbox" opens the Mailboxes sheet's picker.
  const [pickRequest, setPickRequest] = useState(0);

  const { load } = inboxes;
  const openPicker = useCallback(() => {
    setPicking(true);
    load();
  }, [load]);

  useHandoff(
    "pickInbox",
    useCallback(() => {
      if (mediaMatches(PHONE_QUERY)) setPickRequest((count) => count + 1);
      else openPicker();
    }, [openPicker]),
  );

  return (
    <MailPage
      key={viewing ?? ""}
      viewing={viewing}
      inboxes={inboxes}
      picking={picking}
      openPicker={openPicker}
      closePicker={() => setPicking(false)}
      pickRequest={pickRequest}
    />
  );
}

type SheetState = {
  open: boolean;
  mode: MailboxesSheetMode;
  /** Pick mode: what to move. */
  rows?: MessageSummary[];
  fromMessage?: boolean;
};

function MailPage({
  viewing,
  inboxes: { inboxes, failed, load: loadInboxes },
  picking,
  openPicker,
  closePicker,
  pickRequest,
}: {
  viewing: string | null;
  inboxes: ReturnType<typeof useInboxes>;
  picking: boolean;
  openPicker: () => void;
  closePicker: () => void;
  pickRequest: number;
}) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(EMPTY);
  const [me, setMe] = useState<{ ready: boolean; email: string | null }>({
    ready: false,
    email: null,
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [found, setFound] = useState<MessageSummary | null>(null);
  const [deletions, setDeletions] = useState<MailDeletionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [boxesError, setBoxesError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [acting, setActing] = useState(false);
  const [allowanceTick, setAllowanceTick] = useState(0);
  const [conv, setConv] = useState<{
    key: string;
    thread: MessageSummary[];
    open: string | null;
  }>({ key: "", thread: [], open: null });
  const [originalSize, setOriginalSize] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [wide, setWide] = useState<ReadonlySet<string>>(() => new Set());
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [subjectOpen, setSubjectOpen] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    mode: { kind: "browse" },
  });
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lastDraft, setLastDraft] = useState<Draft>(EMPTY_DRAFT);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [seenPickRequest, setSeenPickRequest] = useState(pickRequest);

  const request = useRef(0);
  const fetchedAt = useRef(0);
  // The latest move's undo, for z. Only while its toast is showing.
  const undoRef = useRef<{
    run: () => void;
    label: string;
    toastId: string;
  } | null>(null);
  const moveSeq = useRef(0);
  const quoteTicket = useRef(0);
  const router = useRouter();
  const { user, refresh } = useSession();
  const { open: openPalette, isOpen: palette } = usePalette();
  const { setUnread } = useAdminMail();
  const phone = usePhone();
  const selection = useMailSelection(phone);
  const allowance = useAllowance(!viewing, allowanceTick);
  const from = me.email;

  const {
    value: selected,
    open: openMsg,
    close: closeMsg,
  } = useStackParam("m", { push: BELOW_LG, kind: "page" });
  // The key handler reads this, so held j/k never act on a stale row.
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  });

  const keepDraftRef = useRef<() => void>(() => {});
  const compose = useStackParam("compose", {
    push: BELOW_LG,
    onUserPop: () => keepDraftRef.current(),
  });
  const composeValue = viewing ? null : compose.value;

  const view = useCallback(
    (username: string | null) =>
      router.replace(withAs("/admin/mail", username), { scroll: false }),
    [router],
  );

  const loadMailboxes = useCallback(
    () =>
      fetch(withAs("/api/mail/mailboxes", viewing))
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((boxes: Mailbox[]) => {
          setMailboxes(boxes);
          setMailbox((current) => current ?? boxes[0]?.id ?? null);
          if (!viewing) {
            setUnread(
              boxes.find((box) => box.role === "inbox")?.unreadEmails ?? 0,
            );
          }
          return boxes;
        }),
    [viewing, setUnread],
  );

  const refreshBoxes = useCallback(
    () => void loadMailboxes().catch(() => {}),
    [loadMailboxes],
  );

  const role = mailboxes.find((box) => box.id === mailbox)?.role ?? null;
  const inTrash = role === "trash";
  const inDrafts = role === "drafts";

  const load = useCallback(
    async (position: number, merge = false) => {
      if (!mailbox) return;
      const ticket = ++request.current;
      setPaging(true);
      const params = new URLSearchParams({
        mailbox,
        limit: String(PAGE),
        position: String(position),
        // Trash is per message, so "Request deletion" stays exact.
        threaded: role === "trash" ? "0" : "1",
      });

      try {
        const res = await fetch(
          withAs(`/api/mail/messages?${params}`, viewing),
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Omit<Page, "mailbox">;
        if (ticket !== request.current) return;
        fetchedAt.current = Date.now();
        setError(null);
        setPage((prev) => {
          if (prev.mailbox !== mailbox || (position === 0 && !merge)) {
            return { mailbox, ...data };
          }
          const counts = { ...prev.threadCounts, ...data.threadCounts };
          if (position > 0) {
            const have = new Set(prev.messages.map((item) => item.id));
            return {
              mailbox,
              messages: [
                ...prev.messages,
                ...data.messages.filter((item) => !have.has(item.id)),
              ],
              total: data.total,
              threadCounts: counts,
            };
          }
          // A refresh: the new first page, then any later pages already
          // loaded, merged by id.
          const fresh = new Set(data.messages.map((item) => item.id));
          return {
            mailbox,
            messages: [
              ...data.messages,
              ...prev.messages
                .slice(PAGE)
                .filter((item) => !fresh.has(item.id)),
            ],
            total: data.total,
            threadCounts: counts,
          };
        });
      } catch {
        if (ticket === request.current) setError("Could not load messages.");
      } finally {
        if (ticket === request.current) setPaging(false);
      }
    },
    [mailbox, role, viewing],
  );

  const refreshList = useCallback(() => {
    void load(0, true);
    refreshBoxes();
  }, [load, refreshBoxes]);

  const settleDeletions = useCallback(
    () =>
      fetch("/api/mail/deletions", { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: { requests: MailDeletionRequest[]; deleted: number } | null,
          ) => {
            if (!data) return;
            setDeletions(data.requests);
            if (data.deleted) {
              closeMsg();
              void load(0);
              refreshBoxes();
            }
          },
        )
        .catch(() => {}),
    [closeMsg, load, refreshBoxes],
  );

  const bootMailboxes = useCallback(() => {
    setBoxesError(false);
    setLoading(true);
    loadMailboxes()
      .catch((status) =>
        viewing
          ? setMissing(true)
          : status === 401
            ? setExpired(true)
            : setBoxesError(true),
      )
      .finally(() => setLoading(false));
  }, [loadMailboxes, viewing]);

  useEffect(() => {
    if (viewing) loadInboxes();
    const timer = setTimeout(bootMailboxes);
    return () => clearTimeout(timer);
  }, [bootMailboxes, loadInboxes, viewing]);

  const settleRef = useRef(settleDeletions);
  useLayoutEffect(() => {
    settleRef.current = settleDeletions;
  });

  useEffect(() => {
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : { email: null }))
      .then((data: { email: string | null }) =>
        setMe({ ready: true, email: data.email }),
      )
      .catch(() => setMe({ ready: true, email: null }));

    fetch("/api/mail/contacts")
      .then((res) => (res.ok ? res.json() : []))
      .then(setContacts)
      .catch(() => setContacts([]));

    void settleRef.current();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(0));
    return () => clearTimeout(timer);
  }, [load]);

  // Refresh when the tab comes back and the list is stale.
  useEffect(() => {
    const maybe = () => {
      if (
        document.visibilityState === "visible" &&
        fetchedAt.current &&
        Date.now() - fetchedAt.current > STALE_MS
      )
        refreshList();
    };
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    return () => {
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
    };
  }, [refreshList]);

  // Re-tapping the Email tab at the top of the list refreshes it. (With a
  // message open, the stack hook already closed it.)
  useEffect(() => {
    const onRetap = (event: Event) => {
      if (event.defaultPrevented || window.scrollY > 0) return;
      event.preventDefault();
      refreshList();
    };
    window.addEventListener("admin:retap", onRetap);
    return () => window.removeEventListener("admin:retap", onRetap);
  }, [refreshList]);

  const current = page.mailbox === mailbox ? page : EMPTY;
  const { messages, total, threadCounts } = current;
  const listReady = page.mailbox === mailbox && mailbox != null;
  const message = selected
    ? (messages.find((item) => item.id === selected) ??
      (found?.id === selected ? found : null))
    : null;
  const open = selected != null;
  const ownDomain = domainOf(from);
  const known = message != null;
  const isFound = message != null && message === found;

  // A deep link, reload or palette jump to a message that isn't in the list.
  useEffect(() => {
    if (!selected || known || loading || !mailbox) return;
    let live = true;
    fetch(withAs(`/api/mail/messages/${encodeURIComponent(selected)}`, viewing))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((hit: MessageSummary) => {
        if (!live) return;
        setFound(hit);
        if (!hit.mailboxIds?.[mailbox]) {
          const box = mailboxes.find((item) => hit.mailboxIds?.[item.id]);
          if (box) setMailbox(box.id);
        }
      })
      .catch(() => live && closeMsg());
    return () => {
      live = false;
    };
  }, [selected, known, loading, mailbox, mailboxes, viewing, closeMsg]);

  // The open conversation, lifted so actions and shortcuts target the thread
  // message on screen (read-missed-3).
  const messageId = message?.id ?? null;
  const threadId = message?.threadId ?? null;
  const count = message ? (threadCounts[message.threadId] ?? 1) : 1;
  useEffect(() => {
    if (!messageId || !threadId || (count <= 1 && !isFound)) return;
    let live = true;
    fetch(withAs(`/api/mail/threads/${encodeURIComponent(threadId)}`, viewing))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { messages: MessageSummary[] }) => {
        if (!live) return;
        setConv((prev) => ({
          key: messageId,
          thread: data.messages,
          open:
            prev.key === messageId && prev.open
              ? prev.open
              : isFound
                ? messageId
                : (data.messages.at(-1)?.id ?? messageId),
        }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [messageId, threadId, count, isFound, viewing]);

  const conversation = message && conv.key === message.id ? conv : null;
  const thread = conversation?.thread ?? [];
  const openId = conversation?.open ?? message?.id ?? null;
  const openMessage =
    (openId && thread.find((item) => item.id === openId)) || message;
  const replyAll = openMessage
    ? otherRecipients(openMessage, from).length > 0
    : false;
  const currentBox = mailboxes.find((box) => box.id === mailbox);
  const folderName = currentBox?.name ?? "Mail";
  const inArchive = Boolean(
    message &&
    mailboxes.some(
      (box) => box.role === "archive" && message.mailboxIds?.[box.id],
    ),
  );
  const deletionPending = Boolean(
    openMessage &&
    deletions.some(
      (request) =>
        (request.status === "pending" || request.status === "approved") &&
        request.messageIds.includes(openMessage.id),
    ),
  );

  const onOpenChange = useCallback(
    (id: string) => {
      if (!messageId) return;
      setConv((prev) => ({
        key: messageId,
        thread: prev.key === messageId ? prev.thread : [],
        open: id,
      }));
    },
    [messageId],
  );

  /** Apply flags locally: list, found hit and loaded thread. */
  const mark = useCallback((ids: string[], flags: Flags) => {
    const hit = new Set(ids);
    setPage((prev) => ({
      ...prev,
      messages: prev.messages.map((item) =>
        hit.has(item.id) ? withKeywords(item, flags) : item,
      ),
    }));
    setFound((prev) =>
      prev && hit.has(prev.id) ? withKeywords(prev, flags) : prev,
    );
    setConv((prev) => ({
      ...prev,
      thread: prev.thread.map((item) =>
        hit.has(item.id) ? withKeywords(item, flags) : item,
      ),
    }));
  }, []);

  const flag = useCallback(
    async (ids: string[], flags: Flags) => {
      if (!ids.length) return;
      mark(ids, flags);
      const single = ids.length === 1;
      const ok = await fetch(
        single
          ? `/api/mail/messages/${encodeURIComponent(ids[0])}/flags`
          : "/api/mail/messages/bulk/flags",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(single ? flags : { ids, ...flags }),
        },
      )
        .then((res) => res.ok)
        .catch(() => false);
      if (!ok) {
        mark(ids, inverse(flags));
        toast({ tone: "error", message: "Couldn't update. Try again" });
        return;
      }
      if ("seen" in flags) refreshBoxes();
    },
    [mark, refreshBoxes],
  );

  const onRead = useCallback(
    (id: string) => {
      mark([id], { seen: true });
      refreshBoxes();
    },
    [mark, refreshBoxes],
  );

  const restoreRows = useCallback(
    (snapshot: { index: number; item: MessageSummary }[], box: string) =>
      setPage((prev) => {
        if (prev.mailbox !== box) return prev;
        const have = new Set(prev.messages.map((item) => item.id));
        const next = [...prev.messages];
        let added = 0;
        for (const { index, item } of snapshot) {
          if (have.has(item.id)) continue;
          next.splice(Math.min(index, next.length), 0, item);
          added += 1;
        }
        return { ...prev, messages: next, total: prev.total + added };
      }),
    [],
  );

  /**
   * Archive, delete or move whole conversations (spec D18): the rows leave
   * the list at once, the server moves every message of their threads that
   * is in this folder, and the toast's Undo (or z) moves exactly those back.
   */
  const moveConversations = useCallback(
    async (
      rows: MessageSummary[],
      target: MoveTarget,
      opts: { fromMessage?: boolean; keyboard?: boolean } = {},
    ) => {
      if (!mailbox || viewing || !rows.length) return;
      const box = mailbox;
      const rowIds = new Set(rows.map((row) => row.id));
      const snapshot = messages
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => rowIds.has(item.id));
      const name =
        "mailboxId" in target
          ? (mailboxes.find((item) => item.id === target.mailboxId)?.name ??
            "the folder")
          : null;
      const [verb, done] =
        "to" in target
          ? target.to === "archive"
            ? ["archive", "archived"]
            : ["delete", "deleted"]
          : ["move", `moved to ${name}`];

      // A new move replaces the last one's undo (and its toast), so z never
      // reaches past what's on screen and toasts don't queue up behind it.
      const seq = ++moveSeq.current;
      const previous = undoRef.current;
      undoRef.current = null;
      if (previous) dismissToast(previous.toastId);

      setPage((prev) =>
        prev.mailbox !== box
          ? prev
          : {
              ...prev,
              messages: prev.messages.filter((item) => !rowIds.has(item.id)),
              total: Math.max(0, prev.total - snapshot.length),
            },
      );
      selection.clear();
      if (opts.fromMessage) closeMsg();
      // The pressed button (toolbar, bulk bar) or the open message is gone:
      // land on the row that took the first removed row's place.
      if (!opts.keyboard) focusListAt(snapshot[0]?.index ?? 0);
      setActing(true);

      const known: Record<string, MessageSummary[]> = {};
      if (conversation && message)
        known[message.threadId] = conversation.thread;
      const ids = await expandConversation({
        messages: rows,
        threadCounts,
        from: box,
        viewing,
        known,
      });
      const ok = await moveIds(ids, target);
      setActing(false);
      if (!ok) {
        restoreRows(snapshot, box);
        toast({ tone: "error", message: `Couldn't ${verb}. Try again` });
        return;
      }
      refreshBoxes();

      const undo = async () => {
        const back = await moveIds(ids, { mailboxId: box });
        if (!back) {
          toast({ tone: "error", message: "Couldn't undo. Try again" });
          return;
        }
        restoreRows(snapshot, box);
        refreshBoxes();
      };
      let toastId = "";
      const undoThis = () => {
        if (undoRef.current?.run === undoThis) undoRef.current = null;
        dismissToast(toastId);
        void undo();
      };

      const label =
        rows.length > 1
          ? `${rows.length} conversations ${done}`
          : ids.length > 1
            ? `Conversation ${done}`
            : done.charAt(0).toUpperCase() + done.slice(1);
      toastId = toast({
        message: label,
        action: { label: "Undo", onAction: undoThis },
      });
      // A later move started while this one was in flight: its undo wins.
      if (seq === moveSeq.current)
        undoRef.current = { run: undoThis, label, toastId };
      if (opts.keyboard) pointTabAtToast();
    },
    [
      mailbox,
      viewing,
      messages,
      mailboxes,
      selection,
      closeMsg,
      conversation,
      message,
      threadCounts,
      restoreRows,
      refreshBoxes,
    ],
  );

  /**
   * Leaves phone selection mode from a control that goes away with it (the
   * toolbar's Read/Star, the top bar's Cancel): focus lands on the first
   * checked row, which stays mounted, rather than dropping to <body>.
   */
  const leaveSelection = useCallback(() => {
    const first = selection.selecting
      ? messages.find((item) => selection.checked.has(item.id))?.id
      : undefined;
    selection.clear();
    if (first)
      focusLater(() =>
        document.querySelector<HTMLElement>(
          `[data-stack-return="${CSS.escape(first)}"]`,
        ),
      );
  }, [selection, messages]);

  const requestPurge = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const reason = await ask({
        title: "Request permanent deletion",
        detail:
          "A co-president has to approve this before the message is destroyed. Say why it should go.",
        placeholder: "Reason",
        confirmLabel: "Request deletion",
        destructive: true,
        withInput: true,
        required: true,
      });
      if (reason === null) return;
      setActing(true);
      let purged = false;
      let failure: string | null = null;
      for (const id of ids) {
        const res = await fetch(
          `/api/mail/messages/${encodeURIComponent(id)}/purge`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        ).catch(() => null);
        const data = (await res?.json().catch(() => null)) as {
          purged?: number;
          error?: string;
        } | null;
        if (!res?.ok) {
          failure = data?.error ?? "Could not ask for that deletion.";
          break;
        }
        if (data?.purged !== undefined) purged = true;
      }
      setActing(false);
      leaveSelection();
      if (failure) {
        toast({ tone: "error", message: failure });
        return;
      }
      if (purged) {
        closeMsg();
        void load(0);
        refreshBoxes();
        toast({ message: "Deleted for good." });
        return;
      }
      toast({
        message: "Asked a co-president to approve it. Nothing is gone yet.",
      });
      void settleDeletions();
    },
    [leaveSelection, closeMsg, load, refreshBoxes, settleDeletions],
  );

  /* ----------------------------------------------------------- compose */

  const composeBase = useCallback(
    (target: MessageSummary, mode: ComposeMode): Draft => {
      if (mode === "fwd") return { subject: prefixed(target.subject, "Fwd:") };
      const sender = target.from?.[0]?.email;
      const others = otherRecipients(target, from);
      return {
        to: sender ? [sender] : [],
        ...(mode === "replyall" && others.length ? { cc: others } : {}),
        subject: prefixed(target.subject, "Re:"),
      };
    },
    [from],
  );

  const quoteInto = useCallback((target: MessageSummary, mode: ComposeMode) => {
    const ticket = ++quoteTicket.current;
    buildQuote(target, mode === "fwd" ? "forward" : "reply")
      .catch(() => "")
      .then((quoteHtml) => {
        if (ticket !== quoteTicket.current) return;
        setDraft((prev) => prev && { ...prev, quoteHtml, quoting: false });
      });
  }, []);

  const openComposeFor = compose.open;
  // The Drafts-folder message being edited: moved to Trash once it is sent.
  const editSource = useRef<string | null>(null);
  /** Opens compose in the tap handler: draft first, then the stack param. */
  const startCompose = useCallback(
    (mode: ComposeMode, target?: MessageSummary | null) => {
      editSource.current = null;
      if (mode === "new" || !target) {
        quoteTicket.current += 1;
        setDraft({ html: "", quoting: false, mode: "new" });
        openComposeFor("new");
        return;
      }
      setDraft({ ...composeBase(target, mode), html: "", quoting: true, mode });
      openComposeFor(`${mode}:${target.id}`);
      quoteInto(target, mode);
    },
    [composeBase, openComposeFor, quoteInto],
  );

  /**
   * A draft from the Drafts folder opens in the composer (as in native mail
   * apps), seeded from the saved message. Compose snapshots its seed when it
   * opens, so the body is fetched first.
   */
  const editDraft = useCallback(
    async (target: MessageSummary) => {
      const ticket = ++quoteTicket.current;
      const seed = await draftSeed(target.id).catch(() => null);
      if (ticket !== quoteTicket.current) return;
      if (!seed) {
        toast({ tone: "error", message: "Couldn't open the draft. Try again" });
        return;
      }
      editSource.current = target.id;
      setDraft(seed);
      openComposeFor(`edit:${target.id}`);
    },
    [openComposeFor],
  );

  /** After sending an edited draft: the saved copy goes to Trash. */
  const retireDraft = useCallback(
    (id: string) =>
      // Once Compose has closed (its history entry popped), so leaving the
      // open draft doesn't race that pop.
      afterDialogs(() => {
        if (selectedRef.current === id) closeMsg();
        setPage((prev) =>
          prev.messages.some((item) => item.id === id)
            ? {
                ...prev,
                messages: prev.messages.filter((item) => item.id !== id),
                total: Math.max(0, prev.total - 1),
              }
            : prev,
        );
        void moveIds([id], { to: "trash" }).then((ok) => {
          if (ok) refreshBoxes();
          else void load(0, true);
        });
      }),
    [closeMsg, refreshBoxes, load],
  );

  const keepDraft = useCallback(() => {
    flushDraft();
    const stored = loadDraft(draftKey(from));
    setDraft(null);
    // Nothing kept: no later send may retire the draft that was being edited.
    if (!stored) {
      editSource.current = null;
      return;
    }
    afterDialogs(() =>
      toast({
        message: "Draft saved",
        action: { label: "Reopen", onAction: () => openComposeFor("restore") },
      }),
    );
  }, [from, openComposeFor]);
  useLayoutEffect(() => {
    keepDraftRef.current = keepDraft;
  });

  // page.tsx guarantees a draft whenever compose is open: seed from the
  // store (reload, Reopen, a palette jump to ?compose=new), else empty.
  if (compose.value == null && seeded != null) setSeeded(null);
  if (
    composeValue != null &&
    draft == null &&
    me.ready &&
    seeded !== composeValue
  ) {
    setSeeded(composeValue);
    const stored = loadDraft(draftKey(from));
    if (stored) setDraft(stored);
    else if (composeValue === "new") setDraft({ ...EMPTY_DRAFT });
  }
  if (draft && draft !== lastDraft) setLastDraft(draft);

  // …or, with nothing stored, rebuild a reply once its target is found.
  const composeClose = compose.close;
  const needsTarget =
    composeValue != null &&
    draft == null &&
    me.ready &&
    seeded === composeValue;
  useEffect(() => {
    if (!needsTarget || composeValue == null) return;
    const colon = composeValue.indexOf(":");
    const mode = colon > 0 ? composeValue.slice(0, colon) : composeValue;
    const id = colon > 0 ? composeValue.slice(colon + 1) : "";
    if (mode === "edit" && id) {
      let live = true;
      draftSeed(id)
        .then((seed) => {
          if (!live) return;
          editSource.current = id;
          setDraft(seed);
        })
        .catch(() => live && composeClose());
      return () => {
        live = false;
      };
    }
    if (
      composeValue === "restore" ||
      !id ||
      !(REPLY_MODES as readonly string[]).includes(mode)
    ) {
      composeClose();
      return;
    }
    let live = true;
    const local =
      messages.find((item) => item.id === id) ??
      thread.find((item) => item.id === id) ??
      (found?.id === id ? found : null);
    (local
      ? Promise.resolve(local)
      : fetch(
          withAs(`/api/mail/messages/${encodeURIComponent(id)}`, viewing),
        ).then((res) =>
          res.ok ? (res.json() as Promise<MessageSummary>) : Promise.reject(),
        )
    )
      .then((target) => {
        if (!live) return;
        const composeMode = mode as ComposeMode;
        setDraft({
          ...composeBase(target, composeMode),
          html: "",
          quoting: true,
          mode: composeMode,
        });
        quoteInto(target, composeMode);
      })
      .catch(() => live && composeClose());
    return () => {
      live = false;
    };
    // Runs once per seeding; the lists it reads are a best-effort shortcut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTarget, composeValue]);

  // Viewing someone else's inbox never composes.
  useEffect(() => {
    if (viewing && compose.value != null) composeClose();
  }, [viewing, compose.value, composeClose]);

  const composeOpen = composeValue != null && draft != null;

  /* --------------------------------------------------- sheets and chrome */

  const openBrowse = useCallback((view: "folders" | "inboxes" = "folders") => {
    setRefreshed(
      fetchedAt.current ? updatedLabel(Date.now() - fetchedAt.current) : null,
    );
    setSheet({ open: true, mode: { kind: "browse", view } });
  }, []);

  if (pickRequest !== seenPickRequest) {
    setSeenPickRequest(pickRequest);
    if (user?.isMailAdmin) {
      setRefreshed(null);
      setSheet({ open: true, mode: { kind: "browse", view: "inboxes" } });
    }
  }

  const openPick = useCallback(
    (rows: MessageSummary[], fromMessage = false) => {
      const exclude = mailbox ? [mailbox] : [];
      setSheet({
        open: true,
        mode: { kind: "pick", exclude, count: rows.length },
        rows,
        fromMessage,
      });
    },
    [mailbox],
  );

  const closeSheet = useCallback(
    () => setSheet((prev) => ({ ...prev, open: false })),
    [],
  );

  const switchFolder = useCallback(
    (id: string) => {
      closeMsg();
      selection.clear();
      setMailbox(id);
      window.scrollTo(0, 0);
    },
    [closeMsg, selection],
  );

  const shown: { name: string; address?: string } | null = viewing
    ? (inboxes?.find((inbox) => inbox.username === viewing) ?? {
        name: viewing,
      })
    : null;

  const folderUnread = currentBox?.unreadEmails ?? 0;

  useTopBar(
    {
      largeTitle: false,
      title: (
        <button
          type="button"
          aria-haspopup="dialog"
          data-mail-title
          onClick={() => openBrowse()}
          className="press-flat -ml-1.5 flex h-11 max-w-full flex-col items-start justify-center rounded-[10px] px-1.5 text-left font-extrabold text-ink"
        >
          <span className="flex max-w-full items-center gap-1 leading-tight">
            <span className="truncate">{folderName}</span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0"
              strokeWidth={3}
            />
            {folderUnread > 0 && (
              <>
                <span
                  aria-hidden
                  className="min-w-5 shrink-0 rounded-full border-2 border-line bg-brand px-1 text-center text-[11px] leading-4 font-bold text-brand-ink"
                >
                  {folderUnread}
                </span>
                <span className="sr-only">, {folderUnread} unread</span>
              </>
            )}
          </span>
          {shown && (
            <span className="max-w-full truncate text-xs leading-tight font-normal text-subtle">
              Read-only · {shown.name}
            </span>
          )}
        </button>
      ),
      docTitle: `${folderName} – Mail`,
      actions: shown ? (
        <button
          type="button"
          onClick={() => view(null)}
          className="press-flat min-h-11 rounded-[10px] px-2 font-bold text-ink"
        >
          Exit
        </button>
      ) : undefined,
    },
    { active: !open },
  );

  const allChecked =
    selection.checked.size > 0 && selection.checked.size === messages.length;
  useTopBar(
    {
      back: { label: "Cancel", onBack: leaveSelection, chevron: false },
      title: (
        <span aria-live="polite" aria-atomic="true">
          {selection.checked.size} selected
        </span>
      ),
      hideSearch: true,
      actions: (
        <button
          type="button"
          onClick={() =>
            selection.setAll(
              allChecked ? null : messages.map((item) => item.id),
            )
          }
          className="press-flat min-h-11 rounded-[10px] px-2 font-bold whitespace-nowrap text-ink"
        >
          {allChecked ? "Deselect all" : "Select all"}
        </button>
      ),
    },
    { active: selection.selecting && !open },
  );

  const openFlagged = Boolean(openMessage?.keywords?.$flagged);
  useTopBar(
    {
      back: { label: folderName, onBack: closeMsg },
      title: "",
      docTitle: message?.subject || "(no subject)",
      hideSearch: true,
      actions: (
        <>
          {viewing ? (
            openFlagged && (
              <span className="grid size-11 place-items-center">
                <Star aria-hidden size={20} className="fill-brand text-brand" />
                <span className="sr-only">Starred</span>
              </span>
            )
          ) : (
            <button
              type="button"
              aria-label="Star"
              aria-pressed={openFlagged}
              disabled={!openMessage}
              onClick={() =>
                openMessage &&
                void flag([openMessage.id], { flagged: !openFlagged })
              }
              className={TOP_ICON}
            >
              <Star
                aria-hidden
                size={20}
                className={openFlagged ? "fill-brand text-brand" : ""}
              />
            </button>
          )}
          <button
            type="button"
            aria-label="More actions"
            aria-haspopup="dialog"
            disabled={!openMessage}
            onClick={() => setMoreOpen(true)}
            className={TOP_ICON}
          >
            <Ellipsis aria-hidden size={22} />
          </button>
        </>
      ),
    },
    { active: open },
  );

  useHideTabBar((phone && open && Boolean(viewing)) || composeOpen);

  /* ------------------------------------------------------- keyboard */

  const keys = useRef({
    messages,
    message,
    openMessage,
    viewing,
    palette,
    composing: composeValue != null,
  });
  useLayoutEffect(() => {
    keys.current = {
      messages,
      message,
      openMessage,
      viewing,
      palette,
      composing: composeValue != null,
    };
  });
  const actions = useRef({
    moveConversations,
    flag,
    startCompose,
    openPalette,
  });
  useLayoutEffect(() => {
    actions.current = { moveConversations, flag, startCompose, openPalette };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Nothing behind a dialog (attachment viewer, compose, asks, sheets).
      if (document.querySelector("dialog[open]")) return;
      const state = keys.current;
      const act = actions.current;
      if (
        state.palette ||
        state.composing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }
      if (state.viewing && ["e", "#", "r", "s", "z"].includes(event.key)) {
        return;
      }

      const selectedNow = selectedRef.current;
      const row =
        state.messages.find((item) => item.id === selectedNow) ??
        (state.message?.id === selectedNow ? state.message : null);

      const step = (delta: number) => {
        const list = state.messages;
        const index = list.findIndex((item) => item.id === selectedNow);
        const next =
          list[
            index === -1
              ? 0
              : Math.min(Math.max(index + delta, 0), list.length - 1)
          ];
        if (!next || next.id === selectedNow) return;
        openMsg(next.id, { replace: selectedNow != null });
        selectedRef.current = next.id;
        document
          .querySelector(`[data-message="${CSS.escape(next.id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      };

      switch (event.key) {
        case "j":
          step(1);
          break;
        case "k":
          step(-1);
          break;
        case "/":
          event.preventDefault();
          act.openPalette();
          break;
        case "e":
          if (row)
            void act.moveConversations(
              [row],
              { to: "archive" },
              { fromMessage: true, keyboard: true },
            );
          break;
        case "#":
          if (row)
            void act.moveConversations(
              [row],
              { to: "trash" },
              { fromMessage: true, keyboard: true },
            );
          break;
        case "z": {
          // Only the move whose toast is up. Another toast in front ("Message
          // sent") means ours is still queued: keep it. No toast at all means
          // ours expired: drop it.
          const pending = undoRef.current;
          if (!pending) break;
          const shown = shownToast();
          if (shown === pending.label) pending.run();
          else if (shown == null) undoRef.current = null;
          break;
        }
        case "r":
          if (state.openMessage) {
            // Compose focuses its editor inside this keydown: don't type "r".
            event.preventDefault();
            act.startCompose("reply", state.openMessage);
          }
          break;
        case "s":
          if (state.openMessage)
            void act.flag([state.openMessage.id], {
              flagged: !state.openMessage.keywords?.$flagged,
            });
          break;
        case "u":
        case "Escape":
          closeMsg();
          selectedRef.current = null;
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMsg, closeMsg]);

  /* --------------------------------------------------------- render */

  if (expired) {
    return (
      <div className="m-4 animate-rise-in rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut">
        <p className="font-bold text-brand">Your mail session expired.</p>
        <p className="mt-2 max-w-prose text-sm text-subtle">
          Mail signs in to the mail server on your behalf, and that sign-in
          lapses after 30 minutes of inactivity. Signing in again reconnects it.
        </p>
        <button
          type="button"
          onClick={async () => {
            await logout();
            await refresh();
          }}
          className={`mt-5 ${BUTTON}`}
        >
          Sign in again
        </button>
      </div>
    );
  }
  if (missing) {
    return (
      <div className="m-4 animate-rise-in rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut">
        <p className="font-bold text-brand">
          No such inbox, or you may not read it.
        </p>
        <button
          type="button"
          onClick={() => view(null)}
          className={`mt-5 ${BUTTON}`}
        >
          Back to your inbox
        </button>
      </div>
    );
  }
  if (boxesError) {
    return (
      <RetryRow
        message="Could not reach the mail server."
        onRetry={bootMailboxes}
      />
    );
  }

  const checkedRows = messages.filter((item) => selection.checked.has(item.id));
  const onFitted = (id: string, state: FitState) =>
    setWide((prev) => {
      if (prev.has(id) === state.wide) return prev;
      const next = new Set(prev);
      if (state.wide) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    // Phone: at least a screen tall, and over <main>'s extra 1rem bottom
    // padding, so the white surface always reaches the toolbar / tab bar.
    <div className="flex animate-fade-in flex-col phone:-mb-4 phone:h-auto phone:min-h-[calc(100svh-var(--admin-top)-var(--admin-bottom))] phone:p-0 desk:max-lg:h-[calc(100dvh-var(--admin-top))] desk:max-lg:gap-4 desk:max-lg:p-4 lg:h-[calc(100dvh-3.625rem)] lg:flex-row lg:gap-4 lg:p-4">
      <aside
        className={`min-h-0 w-full shrink-0 flex-col gap-3 lg:flex lg:w-52 lg:shrink-0 phone:hidden ${open ? "hidden" : "flex"}`}
      >
        {user?.isMailAdmin && (
          <InboxPicker
            inboxes={inboxes}
            failed={failed}
            self={from}
            viewing={shown}
            open={picking}
            onOpen={openPicker}
            onClose={closePicker}
            onPick={view}
          />
        )}
        {!viewing && (
          <button
            type="button"
            onClick={() => startCompose("new")}
            className="shrink-0 rounded-[10px] border-2 border-line bg-brand px-4 py-2.5 font-bold text-brand-ink shadow-brut-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            Compose
          </button>
        )}
        <MailboxList
          mailboxes={mailboxes}
          selected={mailbox}
          onSelect={switchFolder}
        />
        {!viewing && (
          <>
            <Allowance {...allowance} />
            <Link
              className="shrink-0 rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-center text-xs font-bold text-ink hover:bg-tint"
              href="/admin/mail/setup"
            >
              Set up on your phone
            </Link>
          </>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border-2 border-line bg-surface shadow-brut phone:overflow-visible phone:rounded-none phone:border-0 phone:shadow-none">
        {shown && (
          <div
            role="status"
            className="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-line bg-tint px-4 py-2.5 text-sm phone:sr-only"
          >
            <Eye size={15} className="shrink-0 text-brand" aria-hidden />
            <p className="min-w-0 flex-1 font-semibold text-ink">
              Reading {shown.name}&rsquo;s inbox
              {shown.address && ` (${shown.address})`} as an administrator.{" "}
              <span className="text-subtle">
                Read-only — opening a message here does not mark it as read for
                them.
              </span>
            </p>
            <button
              type="button"
              onClick={() => view(null)}
              className="shrink-0 rounded-[8px] border-2 border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink hover:bg-raised phone:hidden"
            >
              Back to your inbox
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div
            className={`min-h-0 w-full flex-col lg:flex lg:w-80 lg:shrink-0 lg:border-r-2 lg:border-line ${open ? "hidden" : "flex"}`}
          >
            <header className="shrink-0 space-y-2 border-b-2 border-line px-4 py-2.5 phone:hidden">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="truncate text-sm font-extrabold text-ink">
                  {currentBox?.name ?? "Mail"}
                </h2>
                <p className="shrink-0 text-xs text-subtle">
                  {messages.length} of {total}
                </p>
              </div>
              <button
                type="button"
                onClick={openPalette}
                className="flex w-full items-center gap-2 rounded-[8px] border-2 border-line bg-surface px-2 py-1 text-sm text-subtle hover:bg-tint pointer-coarse:min-h-11"
              >
                <Search size={14} aria-hidden />
                <span className="flex-1 text-left">Search everything</span>
                <kbd className="hidden rounded-[6px] border-2 border-line px-1 text-[10px] font-bold text-ink pointer-fine:inline">
                  ⌘K
                </kbd>
              </button>
            </header>

            {!viewing && selection.checked.size > 0 && (
              <BulkActions
                busy={acting}
                count={selection.checked.size}
                inTrash={inTrash}
                onArchive={() =>
                  void moveConversations(checkedRows, { to: "archive" })
                }
                onClear={selection.clear}
                onMarkRead={() =>
                  void flag([...selection.checked], { seen: true })
                }
                onMarkUnread={() =>
                  void flag([...selection.checked], { seen: false })
                }
                onStar={() =>
                  void flag([...selection.checked], { flagged: true })
                }
                onTrash={() =>
                  inTrash
                    ? void requestPurge([...selection.checked])
                    : void moveConversations(checkedRows, { to: "trash" })
                }
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto desk:overscroll-contain phone:flex-none phone:overflow-visible phone:pb-24">
              {!viewing && <AllowanceWarning {...allowance} />}
              {error && !messages.length ? (
                <RetryRow message={error} onRetry={() => void load(0)} />
              ) : !listReady ? (
                <>
                  <span className="sr-only" role="status">
                    Loading mail…
                  </span>
                  <MessageListSkeleton />
                </>
              ) : (
                <MessageList
                  key={mailbox}
                  checked={selection.checked}
                  selecting={selection.selecting}
                  messages={messages}
                  onCheck={viewing ? undefined : selection.toggle}
                  onCheckAll={
                    viewing
                      ? undefined
                      : (on) =>
                          selection.setAll(
                            on ? messages.map((item) => item.id) : null,
                          )
                  }
                  onSelect={(id) => {
                    // Phone: a saved draft opens in the composer.
                    const draftRow =
                      phone && inDrafts && !viewing
                        ? messages.find((item) => item.id === id)
                        : undefined;
                    if (draftRow) void editDraft(draftRow);
                    else openMsg(id);
                  }}
                  ownDomain={ownDomain}
                  selected={selected}
                  threadCounts={threadCounts}
                  role={role}
                  folderName={folderName}
                  onFlag={
                    viewing
                      ? undefined
                      : (item, flagged) => void flag([item.id], { flagged })
                  }
                />
              )}
              {listReady && messages.length < total && (
                <button
                  type="button"
                  disabled={paging}
                  onClick={() => void load(messages.length)}
                  className="w-full border-t-2 border-line px-4 py-3 text-sm font-bold text-brand hover:bg-tint disabled:opacity-50 phone:min-h-12 phone:border-line/15 phone:text-base phone:text-ink"
                >
                  {paging
                    ? "Loading…"
                    : `Load ${Math.min(PAGE, total - messages.length)} more`}
                </button>
              )}
            </div>
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 flex-col ${open ? "flex" : "hidden lg:flex"}`}
          >
            {message && openId ? (
              <>
                <MessageActions
                  message={message}
                  mailboxes={mailboxes}
                  busy={acting}
                  viewing={Boolean(viewing)}
                  replyAll={replyAll}
                  onBack={closeMsg}
                  onReply={(all) =>
                    startCompose(all ? "replyall" : "reply", openMessage)
                  }
                  onForward={() => startCompose("fwd", openMessage)}
                  flagged={openFlagged}
                  unread={!openMessage?.keywords?.$seen}
                  onFlag={(flags) =>
                    openMessage && void flag([openMessage.id], flags)
                  }
                  onUnread={() => {
                    if (openMessage)
                      void flag([openMessage.id], { seen: false });
                    closeMsg();
                  }}
                  onMove={(to) =>
                    void moveConversations([message], to, {
                      fromMessage: true,
                    })
                  }
                  inTrash={inTrash}
                  deletionPending={deletionPending}
                  onPurge={() =>
                    openMessage && void requestPurge([openMessage.id])
                  }
                />
                <h2
                  data-stack-heading
                  tabIndex={-1}
                  className="shrink-0 border-b-2 border-line px-5 py-3 text-lg font-extrabold text-brand outline-none phone:border-b-0 phone:px-4 phone:pt-3 phone:pb-1 phone:leading-snug phone:wrap-anywhere phone:text-ink short:pt-1 short:pb-0 short:text-base"
                >
                  {phone ? (
                    // Clamped to two lines (one in landscape); a tap, or
                    // Enter/Space, shows the whole subject.
                    <button
                      type="button"
                      aria-expanded={subjectOpen === message.id}
                      onClick={() =>
                        setSubjectOpen((prev) =>
                          prev === message.id ? null : message.id,
                        )
                      }
                      // A 44px hit area without adding height.
                      className="-my-2.5 block w-full py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          subjectOpen !== message.id &&
                            "line-clamp-2 short:line-clamp-1",
                        )}
                      >
                        {message.subject || "(no subject)"}
                      </span>
                    </button>
                  ) : (
                    message.subject || "(no subject)"
                  )}
                </h2>
                <Conversation
                  key={message.id}
                  message={message}
                  thread={thread}
                  open={openId}
                  onOpenChange={onOpenChange}
                  ownDomain={ownDomain}
                  viewing={viewing}
                  onRead={onRead}
                  fit={!originalSize.has(openId)}
                  onFitted={onFitted}
                  details={detailsFor === openId}
                  onDetailsChange={(on) => setDetailsFor(on ? openId : null)}
                />
              </>
            ) : open ? (
              <div
                aria-hidden
                className="space-y-3 px-5 py-4 motion-safe:animate-pulse phone:px-4"
              >
                <span className="block h-6 w-4/5 rounded-[6px] bg-line/15" />
                <span className="block h-4 w-1/2 rounded-[6px] bg-line/10" />
                <span className="block h-40 rounded-[10px] bg-line/10" />
              </div>
            ) : (
              <p className="p-6 text-sm text-subtle">
                Select a message to read it. Shortcuts: j/k move,{" "}
                {viewing ? "" : "r reply, e archive, # delete, z undo, "}/
                search.
              </p>
            )}
          </div>
        </div>
      </div>

      {phone && open && message && !viewing && (
        <MessageToolbar
          inTrash={inTrash}
          inDrafts={inDrafts}
          onEditDraft={() => openMessage && void editDraft(openMessage)}
          inArchive={inArchive}
          deletionPending={deletionPending}
          replyAll={replyAll}
          onArchive={() =>
            void moveConversations(
              [message],
              { to: "archive" },
              { fromMessage: true },
            )
          }
          onMove={() => openPick([message], true)}
          onDelete={() =>
            void moveConversations(
              [message],
              { to: "trash" },
              { fromMessage: true },
            )
          }
          onPurge={() => openMessage && void requestPurge([openMessage.id])}
          onReplyAll={() => startCompose("replyall", openMessage)}
          onForward={() => startCompose("fwd", openMessage)}
          onReply={() => startCompose("reply", openMessage)}
        />
      )}
      {phone && selection.selecting && !open && (
        <SelectionToolbar
          anyUnread={checkedRows.some((item) => !item.keywords?.$seen)}
          allFlagged={
            checkedRows.length > 0 &&
            checkedRows.every((item) => item.keywords?.$flagged)
          }
          inTrash={inTrash}
          inArchive={role === "archive"}
          onRead={(seen) => {
            void flag([...selection.checked], { seen });
            leaveSelection();
          }}
          onStar={(flagged) => {
            void flag([...selection.checked], { flagged });
            leaveSelection();
          }}
          onMove={() => openPick(checkedRows)}
          onArchive={() =>
            void moveConversations(checkedRows, { to: "archive" })
          }
          onDelete={() => void moveConversations(checkedRows, { to: "trash" })}
          onPurge={() => void requestPurge([...selection.checked])}
        />
      )}

      {phone && (
        <Fab
          icon={SquarePen}
          label="Compose"
          extended
          onPress={() => startCompose("new")}
          // Stays mounted under Compose (the modal covers it and makes it
          // inert), so closing Compose returns focus to it.
          hidden={Boolean(viewing) || selection.selecting || open}
        />
      )}

      <MailboxesSheet
        open={sheet.open}
        mode={sheet.mode}
        onClose={closeSheet}
        mailboxes={mailboxes}
        current={mailbox}
        onSelect={switchFolder}
        onPick={(mailboxId) =>
          sheet.rows &&
          void moveConversations(
            sheet.rows,
            { mailboxId },
            { fromMessage: sheet.fromMessage },
          )
        }
        refreshed={refreshed}
        onRefresh={() => {
          closeSheet();
          refreshList();
          allowance.reload();
        }}
        account={
          user?.isMailAdmin
            ? {
                inboxes,
                failed,
                load: loadInboxes,
                self: from,
                viewing: shown,
                onPick: view,
              }
            : undefined
        }
        allowance={viewing ? undefined : allowance}
        settings={{
          aliases: Boolean(user?.isMailAdmin),
          shared: Boolean(user?.isApprover),
        }}
        showSetup={!viewing}
      />

      <MessageMoreSheet
        open={moreOpen && open && openMessage != null}
        onClose={() => setMoreOpen(false)}
        viewing={Boolean(viewing)}
        replyAll={replyAll && !inDrafts}
        canFit={openId != null && wide.has(openId)}
        originalSize={openId != null && originalSize.has(openId)}
        detailsOpen={openId != null && detailsFor === openId}
        onUnread={() => {
          if (openMessage) void flag([openMessage.id], { seen: false });
          closeMsg();
          // The ⋯ sheet's returnFocus would otherwise land on the first
          // row once it finishes closing: go back to this message's row.
          if (message) {
            const id = message.id;
            focusLater(() =>
              document.querySelector<HTMLElement>(
                `[data-stack-return="${CSS.escape(id)}"]`,
              ),
            );
          }
        }}
        onMove={() => message && openPick([message], true)}
        onForward={() => startCompose("fwd", openMessage)}
        onToggleFit={() =>
          openId &&
          setOriginalSize((prev) => {
            const next = new Set(prev);
            if (next.has(openId)) next.delete(openId);
            else next.add(openId);
            return next;
          })
        }
        onToggleDetails={() => {
          setDetailsFor(detailsFor === openId ? null : openId);
          requestAnimationFrame(() =>
            document
              .getElementById("msg-details")
              ?.scrollIntoView({ block: "nearest" }),
          );
        }}
      />

      {!viewing && (
        <Compose
          open={composeOpen}
          from={from}
          contacts={contacts}
          draft={draft ?? lastDraft}
          onDiscard={() => {
            editSource.current = null;
            setDraft(null);
            compose.close();
          }}
          onKeep={() => {
            // editSource stays: a Reopen of this draft still retires it.
            keepDraft();
            compose.close();
          }}
          onSent={() => {
            const sentDraft = editSource.current;
            editSource.current = null;
            setDraft(null);
            compose.close();
            if (sentDraft) retireDraft(sentDraft);
            afterDialogs(() => toast({ message: "Message sent" }));
            setAllowanceTick((tick) => tick + 1);
            if (role === "sent") refreshList();
          }}
        />
      )}
    </div>
  );
}

const prefixed = (subject: string | null, prefix: string) =>
  subject?.toLowerCase().startsWith(prefix.toLowerCase())
    ? subject
    : `${prefix} ${subject ?? ""}`.trim();

const ACTION =
  "rounded-[8px] border-2 border-line px-2.5 py-1.5 text-sm font-bold text-ink hover:bg-tint disabled:opacity-50";

/** Desk: replaces per-message actions once more than one message is checked. */
function BulkActions({
  count,
  busy,
  inTrash,
  onMarkRead,
  onMarkUnread,
  onStar,
  onArchive,
  onTrash,
  onClear,
}: {
  count: number;
  busy: boolean;
  inTrash: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onStar: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b-2 border-line bg-tint px-4 py-2 phone:hidden">
      <p className="mr-1 text-sm font-bold text-ink">{count} selected</p>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onMarkRead}
      >
        Mark read
      </button>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onMarkUnread}
      >
        Mark unread
      </button>
      <button type="button" className={ACTION} disabled={busy} onClick={onStar}>
        Star
      </button>
      <button
        type="button"
        className={ACTION}
        disabled={busy}
        onClick={onArchive}
      >
        Archive
      </button>
      <button
        type="button"
        className={`${ACTION} text-brand`}
        disabled={busy}
        onClick={onTrash}
      >
        {inTrash ? "Request deletion" : "Delete"}
      </button>
      <button
        type="button"
        className={`${ACTION} ml-auto`}
        onClick={onClear}
        aria-label="Clear selection"
      >
        Clear
      </button>
    </div>
  );
}

/** Desk: the message action bar. Phones use the top bar and MessageToolbar. */
function MessageActions({
  message,
  mailboxes,
  busy,
  viewing,
  replyAll,
  flagged,
  unread,
  onBack,
  onReply,
  onForward,
  onFlag,
  onUnread,
  onMove,
  inTrash,
  deletionPending,
  onPurge,
}: {
  message: MessageSummary;
  mailboxes: Mailbox[];
  busy: boolean;
  viewing: boolean;
  replyAll: boolean;
  flagged: boolean;
  unread: boolean;
  onBack: () => void;
  onReply: (all: boolean) => void;
  onForward: () => void;
  onFlag: (flags: Flags) => void;
  onUnread: () => void;
  onMove: (to: MoveTarget) => void;
  inTrash: boolean;
  deletionPending: boolean;
  onPurge: () => void;
}) {
  const inArchive = mailboxes.some(
    (box) => box.role === "archive" && message.mailboxIds?.[box.id],
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 border-b-2 border-line px-3 py-2.5 lg:px-5 phone:hidden ${viewing ? "lg:hidden" : ""}`}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the list"
        className={`${ACTION} lg:hidden`}
      >
        <ArrowLeft size={15} aria-hidden />
      </button>
      {!viewing && (
        <>
          <button
            type="button"
            aria-label="Reply"
            className={`${ACTION} flex items-center gap-1.5`}
            onClick={() => onReply(false)}
          >
            <ReplyIcon size={15} aria-hidden />
            <span className="hidden sm:inline">Reply</span>
          </button>
          {replyAll && (
            <button
              type="button"
              aria-label="Reply all"
              className={`${ACTION} flex items-center gap-1.5`}
              onClick={() => onReply(true)}
            >
              <ReplyAllIcon size={15} aria-hidden />
              <span className="hidden sm:inline">Reply all</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Forward"
            className={`${ACTION} flex items-center gap-1.5`}
            onClick={onForward}
          >
            <ForwardIcon size={15} aria-hidden />
            <span className="hidden sm:inline">Forward</span>
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label="Star"
              aria-pressed={flagged}
              className={ACTION}
              onClick={() => onFlag({ flagged: !flagged })}
            >
              <Star
                size={15}
                className={`transition-colors duration-[var(--dur-fast)] ease-smooth ${flagged ? "fill-brand text-brand" : "fill-transparent"}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              aria-label="Mark unread"
              disabled={unread}
              title={unread ? "Already unread" : "Mark unread"}
              className={ACTION}
              onClick={onUnread}
            >
              <MailOpen size={15} aria-hidden />
            </button>
            <select
              aria-label="Move to folder"
              value=""
              disabled={busy}
              onChange={(event) =>
                event.target.value && onMove({ mailboxId: event.target.value })
              }
              className="max-w-32 rounded-[8px] border-2 border-line bg-surface px-2.5 py-1.5 text-base font-bold text-ink hover:bg-tint disabled:opacity-50 pointer-fine:text-sm"
            >
              <option value="">Move to…</option>
              {mailboxes
                .filter((box) => !message.mailboxIds?.[box.id])
                .map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              aria-label="Archive"
              disabled={busy || inArchive}
              title={inArchive ? "Already in the archive" : undefined}
              className={`${ACTION} flex items-center gap-1.5`}
              onClick={() => onMove({ to: "archive" })}
            >
              <Archive size={15} aria-hidden />
              <span className="hidden sm:inline">Archive</span>
            </button>
            {inTrash ? (
              deletionPending ? (
                <span className="rounded-[8px] border-2 border-line bg-tint px-2.5 py-1.5 text-sm font-bold text-ink">
                  Waiting on a co-president
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Request deletion"
                  disabled={busy}
                  className={`${ACTION} flex items-center gap-1.5 text-destructive`}
                  onClick={onPurge}
                >
                  <Trash2 size={15} aria-hidden />
                  <span className="hidden sm:inline">Request deletion</span>
                </button>
              )
            ) : (
              <button
                type="button"
                aria-label="Delete"
                disabled={busy}
                className={`${ACTION} flex items-center gap-1.5 text-brand`}
                onClick={() => onMove({ to: "trash" })}
              >
                <Trash2 size={15} aria-hidden />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
