"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Mailbox } from "@/lib/mail/jmap-mail";
import { announce } from "@/lib/announce";
import { COARSE_QUERY, PHONE_QUERY } from "@/lib/use-media-query";
import { sectionFor } from "./sections";

// The admin shell's shared state (spec §2.3):
// - the top-bar store: screens describe the phone header with useTopBar();
// - the mail context: mailbox, address and the inbox unread count;
// - small shell behaviours (data-admin, the typing flag, the large title).

/* ------------------------------------------------------------ top bar */

export type TopBarConfig = {
  /** Defaults to the section name. Strings are truncated. */
  title?: React.ReactNode;
  /** Sets document.title ("<docTitle> · BrockCSC Admin") while active, and is announced on change. */
  docTitle?: string;
  /** onBack wins; else router.push(href). chevron defaults to true (selection mode's "Cancel" passes false). */
  back?: {
    label: string;
    href?: string;
    onBack?: () => void;
    chevron?: boolean;
  };
  /** At most two size-11 icon buttons, rendered before Search. */
  actions?: React.ReactNode;
  /** One line under the title, e.g. "Read-only · Priya's inbox". */
  subtitle?: React.ReactNode;
  /** The message screen and both selection modes. */
  hideSearch?: boolean;
  /** Root screens hide the header title until the page's h1 scrolls under it. false keeps it visible. Default true. */
  largeTitle?: boolean;
};

type Entry = {
  id: number;
  /** Render order of the registering component: later wins, so a pushed screen beats the list it covers. */
  order: number;
  config: TopBarConfig;
  active: boolean;
};

const shallowEqual = (a: TopBarConfig, b: TopBarConfig) => {
  const keys = Object.keys(a) as (keyof TopBarConfig)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
};

class TopBarStore {
  private entries: readonly Entry[] = [];
  private listeners = new Set<() => void>();
  private nextId = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.entries;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  register(order: number): number {
    this.nextId += 1;
    const entry: Entry = { id: this.nextId, order, config: {}, active: false };
    this.entries = [...this.entries, entry].sort((a, b) => a.order - b.order);
    this.emit();
    return entry.id;
  }

  update(id: number, config: TopBarConfig, active: boolean) {
    const current = this.entries.find((entry) => entry.id === id);
    if (
      !current ||
      (current.active === active && shallowEqual(current.config, config))
    )
      return;
    this.entries = this.entries.map((entry) =>
      entry.id === id ? { ...entry, config, active } : entry,
    );
    this.emit();
  }

  remove(id: number) {
    if (!this.entries.some((entry) => entry.id === id)) return;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.emit();
  }
}

const topBars = new TopBarStore();
const EMPTY: readonly Entry[] = [];
let renderOrder = 0;
const nextRenderOrder = () => {
  renderOrder += 1;
  return renderOrder;
};

/**
 * Describe the phone header for this screen. Registered on mount, updated on
 * every commit (handlers are never stale) and removed on unmount. The header
 * shows the last active entry in render order: a screen rendered later (a
 * pushed message over its list, selection mode after the list's own call)
 * wins while active. Pass `active: false` to keep an entry registered but
 * out of the way. Desk ignores all of it.
 */
export function useTopBar(config: TopBarConfig, opts?: { active?: boolean }) {
  const [order] = useState(nextRenderOrder);
  const idRef = useRef<number | null>(null);
  const active = opts?.active ?? true;

  useLayoutEffect(() => {
    const id = topBars.register(order);
    idRef.current = id;
    return () => {
      topBars.remove(id);
      idRef.current = null;
    };
  }, [order]);

  useLayoutEffect(() => {
    if (idRef.current != null) topBars.update(idRef.current, config, active);
  });
}

/** The top-bar config the phone header shows: the last active entry. */
export function useActiveTopBar(): TopBarConfig | null {
  const entries = useSyncExternalStore(
    topBars.subscribe,
    topBars.getSnapshot,
    () => EMPTY,
  );
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].active) return entries[index].config;
  }
  return null;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Focus is on a pushed screen's heading that already reads `title`. */
const headingSays = (title: string) => {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    active.hasAttribute("data-stack-heading") &&
    squash(active.textContent ?? "") === squash(title)
  );
};

/**
 * document.title from the active docTitle, else the section. Announces
 * docTitle changes, except when focus has moved to a heading that says the
 * same thing (opening a message): the screen reader already read it.
 */
export function useDocumentTitle(path: string, docTitle: string | undefined) {
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    const name = sectionFor(path)?.name;
    document.title = docTitle
      ? `${docTitle} · BrockCSC Admin`
      : name
        ? `${name} | BrockCSC Admin`
        : "BrockCSC Admin";
    const changed = docTitle && docTitle !== announced.current;
    announced.current = docTitle;
    if (!changed) return;
    // A frame later: the stack hook may focus the heading after this commit
    // (its observer runs once the message renders).
    const raf = requestAnimationFrame(() => {
      if (!headingSays(docTitle)) announce(docTitle);
    });
    return () => cancelAnimationFrame(raf);
  }, [path, docTitle]);
}

/* -------------------------------------------------------- large title */

const firstRenderedH1 = () =>
  Array.from(document.querySelectorAll<HTMLElement>("main h1")).find(
    (h1) => h1.offsetParent !== null,
  ) ?? null;

/**
 * Root screens on phones: the header title stays hidden while the page's
 * first rendered `main h1` is visible, and shows once that h1 scrolls under
 * the sticky header. No h1 → shown. Returns whether to show the title.
 */
export function useLargeTitle(
  enabled: boolean,
  headerRef: React.RefObject<HTMLElement | null>,
  path: string,
): boolean {
  const [state, setState] = useState({ path, show: false });

  useEffect(() => {
    if (!enabled) return;
    let observed: HTMLElement | null | undefined;
    let io: IntersectionObserver | null = null;
    let raf = 0;
    const set = (show: boolean) =>
      setState((prev) =>
        prev.path === path && prev.show === show ? prev : { path, show },
      );

    const attach = () => {
      raf = 0;
      const h1 = firstRenderedH1();
      if (h1 === observed) return;
      observed = h1;
      io?.disconnect();
      io = null;
      if (!h1) {
        set(true);
        return;
      }
      const top = Math.round(
        headerRef.current?.getBoundingClientRect().height ?? 0,
      );
      io = new IntersectionObserver(
        ([entry]) => {
          const rootTop = entry.rootBounds?.top ?? top;
          set(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
        },
        { rootMargin: `-${top}px 0px 0px 0px` },
      );
      io.observe(h1);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(attach);
    };

    // Pages render their h1 after a fetch, so watch <main> for it.
    const main = document.getElementById("main-content");
    const mo = new MutationObserver(schedule);
    if (main) {
      mo.observe(main, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "hidden"],
      });
    }
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io?.disconnect();
    };
  }, [enabled, path, headerRef]);

  if (!enabled) return true;
  return state.path === path ? state.show : false;
}

/* ------------------------------------------------------ shell flags */

/** html[data-admin] while the shell (or its skeleton) is up. Layout effect, so the first paint has the chrome variables. */
export function useAdminRootFlag(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.admin = "";
    return () => {
      delete root.dataset.admin;
    };
  }, [active]);
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "",
]);

const isTextEntry = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement &&
    TEXT_INPUT_TYPES.has(el.getAttribute("type")?.toLowerCase() ?? "")) ||
  (el instanceof HTMLElement && el.isContentEditable);

/**
 * html[data-typing] while a text field has focus AND the on-screen keyboard
 * is up (visual viewport gap > 120px), on coarse phones only. It clears when
 * the keyboard closes even if focus stays (Android back, Gboard's hide key).
 * The tab bar hides visually while it's set.
 */
export function useTypingFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia(PHONE_QUERY);
    const coarse = window.matchMedia(COARSE_QUERY);
    const vv = window.visualViewport;
    let raf = 0;

    const update = () => {
      raf = 0;
      const typing =
        phone.matches &&
        coarse.matches &&
        vv != null &&
        isTextEntry(document.activeElement) &&
        window.innerHeight - vv.height - vv.offsetTop > 120;
      root.toggleAttribute("data-typing", typing);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    // Scroll too: iOS pans the visual viewport as the keyboard settles, and
    // offsetTop changes without a resize.
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    phone.addEventListener("change", schedule);
    coarse.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      phone.removeEventListener("change", schedule);
      coarse.removeEventListener("change", schedule);
      root.removeAttribute("data-typing");
    };
  }, []);
}

/* --------------------------------------------------------- provider */

export type AdminMail = {
  hasMailbox: boolean | null;
  mailAddress: string | null;
  /** The signed-in user's inbox unread count; null until known. */
  unread: number | null;
  /** MailPage pushes the count after each own-inbox loadMailboxes() (never while viewing another inbox). */
  setUnread: (n: number) => void;
};

type Chrome = AdminMail & {
  /** The shell's logout: sign out, refresh the session, router.replace('/'). */
  logout: () => Promise<void>;
};

const ChromeContext = createContext<Chrome>({
  hasMailbox: null,
  mailAddress: null,
  unread: null,
  setUnread: () => {},
  logout: async () => {},
});

export const useAdminMail = (): AdminMail => {
  const { hasMailbox, mailAddress, unread, setUnread } =
    useContext(ChromeContext);
  return { hasMailbox, mailAddress, unread, setUnread };
};

export const useAdminLogout = () => useContext(ChromeContext).logout;

export function ChromeProvider({
  hasMailbox,
  mailAddress,
  onLogout,
  children,
}: {
  hasMailbox: boolean | null;
  mailAddress: string | null;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [unread, setUnread] = useState<number | null>(null);

  // The tab bar's unread badge: the inbox count, fetched once and again
  // whenever the tab comes back. A background badge, so a failure just
  // leaves the last count.
  useEffect(() => {
    if (!hasMailbox) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/mail/mailboxes")
        .then((res) => (res.ok ? (res.json() as Promise<Mailbox[]>) : null))
        .then((boxes) => {
          if (cancelled || !boxes) return;
          setUnread(
            boxes.find((box) => box.role === "inbox")?.unreadEmails ?? 0,
          );
        })
        .catch(() => {});
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasMailbox]);

  const value = useMemo<Chrome>(
    () => ({
      hasMailbox,
      mailAddress,
      unread: hasMailbox ? unread : null,
      setUnread,
      logout: onLogout,
    }),
    [hasMailbox, mailAddress, unread, onLogout],
  );

  return (
    <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
  );
}
