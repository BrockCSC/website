"use client";

// matchMedia hooks for the breakpoint vocabulary. The query strings live in
// lib/media-queries.ts (React-free, so server files import them from there);
// they are re-exported here for client callers.

import { useSyncExternalStore } from "react";

import { COARSE_QUERY, PHONE_QUERY } from "./media-queries";

export {
  BELOW_LG,
  COARSE_QUERY,
  DESK_QUERY,
  PHONE_QUERY,
  SHORT_QUERY,
} from "./media-queries";

// One MediaQueryList and one subscribe function per query string, so React
// never resubscribes on re-render (useSyncExternalStore compares identity).
const lists = new Map<string, MediaQueryList>();
const subscribers = new Map<string, (onChange: () => void) => () => void>();

const listFor = (query: string) => {
  let list = lists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    lists.set(query, list);
  }
  return list;
};

const subscribeFor = (query: string) => {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (onChange) => {
      const list = listFor(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
};

/** matchMedia for event handlers and effects. False on the server. */
export const mediaMatches = (query: string) =>
  typeof window !== "undefined" && listFor(query).matches;

const serverSnapshot = () => false;

/**
 * Behaviour only (focus, history mode, fit, Sheet vs inline panel); use the
 * phone:/desk: variants for layout. Admin pages mount after the auth gate, so
 * their first client render is already correct. On server-rendered pages the
 * first render is false and updates after hydration.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeFor(query),
    () => listFor(query).matches,
    serverSnapshot,
  );
}

export const usePhone = () => useMediaQuery(PHONE_QUERY);

export const useCoarsePointer = () => useMediaQuery(COARSE_QUERY);
