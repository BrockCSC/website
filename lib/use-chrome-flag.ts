"use client";

import { useLayoutEffect } from "react";

// Ref-counted attributes on <html> that drive the phone chrome variables in
// globals.css:
// - "toolbar" sets [data-toolbar] (a BottomToolbar is mounted) and, because a
//   toolbar takes the tab bar's slot, also counts as "tabbar-hidden";
// - "tabbar-hidden" sets [data-tabbar="hidden"].
// Layout effects, so the first paint already has the right chrome.

export type ChromeFlag = "toolbar" | "tabbar-hidden";

const counts: Record<ChromeFlag, number> = { toolbar: 0, "tabbar-hidden": 0 };

function apply() {
  const root = document.documentElement;
  root.toggleAttribute("data-toolbar", counts.toolbar > 0);
  if (counts["tabbar-hidden"] > 0) root.dataset.tabbar = "hidden";
  else delete root.dataset.tabbar;
}

const flagsFor = (name: ChromeFlag): ChromeFlag[] =>
  name === "toolbar" ? ["toolbar", "tabbar-hidden"] : [name];

/** Imperative core of useChromeFlag. Returns an idempotent release. */
export function acquireChromeFlag(name: ChromeFlag): () => void {
  if (typeof document === "undefined") return () => {};
  for (const flag of flagsFor(name)) counts[flag] += 1;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const flag of flagsFor(name)) counts[flag] -= 1;
    apply();
  };
}

export function useChromeFlag(name: ChromeFlag, active: boolean) {
  useLayoutEffect(
    () => (active ? acquireChromeFlag(name) : undefined),
    [name, active],
  );
}

/** Hide the phone tab bar while `active` (mail message, compose). */
export const useHideTabBar = (active: boolean) =>
  useChromeFlag("tabbar-hidden", active);
