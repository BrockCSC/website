"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { useRouter } from "next/navigation";

// A push stack mirrored into search params (spec D4).
//
// Local state is the source of truth and the URL is a mirror. Next's patched
// history.pushState syncs useSearchParams inside startTransition, so anything
// derived from useSearchParams would commit a task later, outside the tap's
// user activation. `open()` sets state synchronously in the tap handler and
// writes history in the same handler.
//
// The URL is read only on mount (first render and again after commit), on
// popstate and on a `stack:navigate` event (navigateStack below), never from
// useSearchParams.
//
// History state: Next's patched pushState copies its own internals (__NA and
// the router tree) into the object we pass, and a history-traversal restore
// keeps custom state, so `__stack` and `__scroll` survive
// (next/dist/client/components/app-router.js, copyNextJsInternalHistoryState
// and completeTraverseNavigation's preserveCustomHistoryState).
//
// Close invariant: derive open state only from `value`, end every exit path
// in `close()`, and persist or clear drafts before calling it.

// `__below` is the search string of the entry a push went on top of, so
// close() knows whether the entry below still carries its key.
type HistoryState = {
  __stack?: string;
  __scroll?: number;
  __below?: string;
} & Record<string, unknown>;

type Router = Pick<ReturnType<typeof useRouter>, "push" | "replace">;

export type StackParamOptions = {
  /** 'always', or a media query (BELOW_LG, PHONE_QUERY): push when it matches, replace otherwise. */
  push: "always" | string;
  /** 'page' is a pushed screen rendered in place (message, person): it scrolls to the top and moves focus. Default 'sheet'. */
  kind?: "page" | "sheet";
  /** The value went null through a pop the app didn't start (edge swipe, browser or Android back). */
  onUserPop?: (prev: string) => void;
};

export type StackParam = {
  value: string | null;
  open(next: string, o?: { replace?: boolean }): void;
  close(): void;
};

const NAVIGATE_EVENT = "stack:navigate";

const historyState = (): HistoryState | null => {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as HistoryState) : null;
};

const readParam = (key: string) =>
  new URL(window.location.href).searchParams.get(key);

const hrefWith = (key: string, value: string | null) => {
  const url = new URL(window.location.href);
  if (value == null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
};

const shouldPush = (push: string) =>
  push === "always" || window.matchMedia(push).matches;

/**
 * Our keys only, for a replaceState that changes the URL. Passing
 * history.state as is would carry Next's __NA, which makes its patched
 * replaceState skip the router sync: Next's canonical URL would stay stale
 * and a later router commit (refresh, HMR) would put the old URL back.
 */
const ownState = () => {
  const {
    __NA: _na,
    _N: _n,
    __PRIVATE_NEXTJS_INTERNALS_TREE: _tree,
    ...rest
  } = historyState() ?? {};
  return rest;
};

/** Remember the scroll position on the current history entry. */
const rememberScroll = () => {
  const y = window.scrollY;
  window.history.replaceState({ ...historyState(), __scroll: y }, "");
  return y;
};

const visible = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el.getClientRects().length > 0;

const firstVisible = (selector: string) =>
  Array.from(document.querySelectorAll(selector)).find(visible) ?? null;

const focusQuietly = (el: HTMLElement) => {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
  }
  el.focus({ preventScroll: true });
};

const heading = () => firstVisible("[data-stack-heading]");
const backButton = () => firstVisible("[data-topbar-back]");

/**
 * Focus the new screen's heading (or its back button). After a cross-page
 * jump (`fromJump`) the top bar's back button renders before the message has
 * loaded, so wait up to 3s for the heading and fall back to the back button
 * only then; otherwise either one will do. Focus is taken only if it is on
 * <body> or, after a jump, still where it was (the palette's restored opener).
 */
const focusScreen = (fromJump = false) => {
  const target = () => heading() ?? (fromJump ? null : backButton());
  const now = target();
  if (now) {
    focusQuietly(now);
    return undefined;
  }
  const before = fromJump ? document.activeElement : null;
  const idle = () => {
    const active = document.activeElement;
    return (
      active == null ||
      active === document.body ||
      (before != null && active === before)
    );
  };
  const observer = new MutationObserver(() => {
    const found = target();
    if (!found) return;
    stop();
    if (idle()) focusQuietly(found);
  });
  const timer = setTimeout(() => {
    stop();
    const fallback = fromJump ? backButton() : null;
    if (fallback && idle()) focusQuietly(fallback);
  }, 3000);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
  };
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
};

// When navigateStack last went to another page. The new page's 'page' hooks
// mount with their value already set and focus their screen if this is recent.
let jumpAt = -Infinity;
const recentJump = () => performance.now() - jumpAt < 3000;

// Open instances in the order they opened, so a re-tap of the active tab
// closes only the topmost one.
const openOrder: symbol[] = [];

const removeFromOrder = (id: symbol) => {
  const index = openOrder.indexOf(id);
  if (index >= 0) openOrder.splice(index, 1);
};

export function useStackParam(
  key: string,
  opts: StackParamOptions,
): StackParam {
  const kind = opts.kind ?? "sheet";
  // Reads the URL on the first client render. Safe only where the hook first
  // renders on the client (admin, behind the auth gate). A server-rendered
  // consumer with the param present would hydrate-mismatch (server null,
  // client value): it must seed from useSearchParams() or a prop instead.
  const [value, setValueState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readParam(key),
  );
  const [id] = useState(() => Symbol(key));

  // Mirrors for event listeners; written only in handlers and effects.
  const valueRef = useRef(value);
  const optsRef = useRef(opts);
  const closingRef = useRef(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scrollRef = useRef<number | null>(null);
  const prevValueRef = useRef(value);
  // A close() over another screen of this key, waiting for its popstate.
  const deferredRef = useRef(false);
  // The value just went back to the screen below (a deferred close landed).
  const returnedRef = useRef(false);

  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const setValue = useCallback((next: string | null) => {
    valueRef.current = next;
    setValueState(next);
  }, []);

  const open = useCallback(
    (next: string, o?: { replace?: boolean }) => {
      const prev = valueRef.current;
      if (prev === next) return;
      setValue(next);
      const href = hrefWith(key, next);
      const push = !o?.replace && shouldPush(optsRef.current.push);
      // Only when leaving the root: a pushed screen on top of a pushed
      // screen returns to the one below, not to a remembered list scroll.
      if (prev == null) {
        scrollRef.current = push ? rememberScroll() : window.scrollY;
      }
      if (push) {
        window.history.pushState(
          { __stack: key, __below: window.location.search },
          "",
          href,
        );
      } else window.history.replaceState(ownState(), "", href);
    },
    [key, setValue],
  );

  const close = useCallback(() => {
    if (valueRef.current == null || deferredRef.current) return;
    const state = historyState();
    const stack = state?.__stack;
    if (stack === key || stack === "*") {
      // Pushed over another screen of this key: keep the value until
      // popstate hands over the one below, so no frame renders the list.
      const below = state?.__below;
      const deferred =
        typeof below === "string" && new URLSearchParams(below).has(key);
      if (!deferred) setValue(null);
      deferredRef.current = deferred;
      closingRef.current = true;
      // Safety net: never swallow a later user pop if this one got lost.
      clearTimeout(closingTimer.current);
      closingTimer.current = setTimeout(() => {
        closingRef.current = false;
        if (deferredRef.current) {
          deferredRef.current = false;
          setValue(readParam(key));
        }
      }, 1500);
      window.history.back();
    } else {
      setValue(null);
      window.history.replaceState(ownState(), "", hrefWith(key, null));
    }
  }, [key, setValue]);

  useEffect(() => {
    const sync = (event: Event) => {
      const urlValue = readParam(key);
      const prev = valueRef.current;
      if (event.type === NAVIGATE_EVENT && prev == null) {
        const scroll = (event as CustomEvent<{ scroll?: number }>).detail
          ?.scroll;
        if (typeof scroll === "number") scrollRef.current = scroll;
      }
      if (event.type === "popstate" && closingRef.current) {
        // Our own close(): value is already null, or deferred until now.
        // Follow the URL silently in case the entry below carries this key.
        closingRef.current = false;
        clearTimeout(closingTimer.current);
        if (deferredRef.current && urlValue != null && urlValue !== prev) {
          returnedRef.current = true;
        }
        deferredRef.current = false;
        if (urlValue !== prev) setValue(urlValue);
        return;
      }
      if (urlValue === prev) return;
      setValue(urlValue);
      if (prev != null && urlValue == null) optsRef.current.onUserPop?.(prev);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, [key, setValue]);

  useEffect(() => {
    const onRetap = (event: Event) => {
      if (event.defaultPrevented || valueRef.current == null) return;
      if (openOrder[openOrder.length - 1] !== id) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("admin:retap", onRetap);
    return () => window.removeEventListener("admin:retap", onRetap);
  }, [id, close]);

  useEffect(() => () => clearTimeout(closingTimer.current), []);

  useLayoutEffect(() => {
    if (value == null) removeFromOrder(id);
    else if (!openOrder.includes(id)) openOrder.push(id);
  }, [id, value]);

  useEffect(() => () => removeFromOrder(id), [id]);

  // Re-read the URL once mounted. A cross-page router.push (navigateStack)
  // renders the new page before Next commits its URL, so the useState
  // initializer above can see the previous page's search string. Next writes
  // history in an insertion effect of the same commit, so the URL is current
  // by now. Also covers a hidden route revealed again (effects re-run, state
  // doesn't). Declared before the 'page' effect below, so the re-render this
  // triggers takes the normal way in (scroll to top, focus the heading).
  useLayoutEffect(() => {
    const urlValue = readParam(key);
    if (urlValue === valueRef.current) return;
    // The new page starts at the top: that's where closing should return.
    if (valueRef.current == null) scrollRef.current = 0;
    setValue(urlValue);
  }, [key, setValue]);

  // Pushed screens ('page'): scroll to the top and focus the new heading on
  // the way in; restore the list's scroll and focus on the way out.
  useLayoutEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    const returned = returnedRef.current;
    returnedRef.current = false;
    if (kind !== "page") return;

    // Mounted with the screen already open by a palette jump from another
    // page (the initializer saw the new URL, so there is no null -> value
    // step): take focus the way an open does. A reload leaves focus alone.
    if (prev === value && value != null && recentJump()) {
      return focusScreen(true);
    }

    // Back from a screen pushed over another one: the one below starts at
    // the top with its heading focused, as it did when it opened.
    if (returned && prev != null && value != null) {
      window.scrollTo(0, 0);
      const target = heading() ?? backButton();
      if (target) focusQuietly(target);
      return;
    }

    if (prev == null && value != null) {
      window.scrollTo(0, 0);
      return focusScreen(recentJump());
    }

    if (prev != null && value == null) {
      const y = scrollRef.current ?? historyState()?.__scroll;
      scrollRef.current = null;
      const raf = requestAnimationFrame(() => {
        if (typeof y === "number") window.scrollTo(0, y);
        const back = document.querySelector(
          `[data-stack-return="${CSS.escape(prev)}"]`,
        );
        const target = visible(back) ? back : firstVisible("main h1");
        if (target) focusQuietly(target);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [value, kind]);

  return { value, open, close };
}

const samePath = (a: string, b: string) => {
  const norm = (p: string) => (p === "/" ? "/admin" : p.replace(/\/$/, ""));
  return norm(a) === norm(b);
};

/**
 * Navigate to a URL that may carry stack params (the palette's jumps).
 * Same page: push (or replace) the URL and dispatch `stack:navigate`, which
 * the page's useStackParam hooks read. Another page: router.push, and the new
 * page's hooks read the URL on mount (its entry has no __stack, so close()
 * replaces).
 */
export function navigateStack(
  href: string,
  router: Router,
  o?: { replace?: boolean },
) {
  const url = new URL(href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !samePath(url.pathname, window.location.pathname)
  ) {
    jumpAt = performance.now();
    if (o?.replace) router.replace(href);
    else router.push(href);
    return;
  }
  const scroll = rememberScroll();
  const to = url.pathname + url.search + url.hash;
  if (o?.replace) window.history.replaceState(ownState(), "", to);
  else {
    window.history.pushState(
      { __stack: "*", __below: window.location.search },
      "",
      to,
    );
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { scroll } }));
}
