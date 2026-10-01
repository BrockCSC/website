"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { House, MoreHorizontal } from "lucide-react";
import { SECTION_ICONS } from "./icons";
import { useAdminMail } from "./chrome";
import { sectionFor, type Section } from "./sections";

/** Persistent desk nav: icon-only until lg, full icon+label at lg+. */
export function AdminRail({
  sections,
  path,
}: {
  sections: Section[];
  path: string;
}) {
  const current = sectionFor(path);
  const atHome = path === "/admin";

  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 pointer-coarse:max-lg:px-1"
    >
      <Link
        href="/admin"
        title="Dashboard"
        aria-current={atHome ? "page" : undefined}
        className={`mb-2 flex items-center justify-center gap-3 rounded-[10px] border-b-2 border-line px-3 py-2.5 pb-3.5 lg:justify-start ${
          atHome ? "text-brand" : "text-ink"
        }`}
      >
        <Image
          src="/badger-256.png"
          alt=""
          width={128}
          height={128}
          className="size-6 shrink-0 rounded-[6px]"
          aria-hidden
        />
        <span className="hidden truncate font-extrabold lg:inline">
          Dashboard
        </span>
      </Link>
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.href];
        const active = section.href === current?.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            title={section.name}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-9 items-center justify-center gap-3 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors duration-[var(--dur)] ease-smooth pointer-coarse:min-h-11 lg:justify-start ${
              active ? "bg-brand text-brand-ink" : "text-ink hover:bg-tint"
            }`}
          >
            {Icon && <Icon className="size-4 shrink-0" />}
            <span className="hidden truncate lg:inline">{section.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The tab bar's pin candidates, in priority order; the first two visible ones are pinned. */
const PIN_ORDER = [
  "/admin/mail",
  "/admin/documents",
  "/admin/events",
  "/admin/analytics",
  "/admin/profile",
];

/** The two sections pinned in the phone tab bar (between Home and More). */
export const pinnedSections = (sections: Section[]): Section[] =>
  PIN_ORDER.map((href) => sections.find((section) => section.href === href))
    .filter((section): section is Section => Boolean(section))
    .slice(0, 2);

type Tab = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const MORE_HREF = "/admin/more";

// Tab history (spec D4): history stays [Home, current tab, its stack params].
// A tab entry whose entry below is Home carries HOME_BELOW in history.state,
// so tapping Home from it goes back instead of stacking a second Home. The
// marker goes on after Next commits the push (its HistoryUpdater writes
// history in an insertion effect, before our effect runs), and a history
// traversal keeps custom state.
const HOME_BELOW = "__homeBelow";

const homeBelow = () => {
  const state: unknown = window.history.state;
  return (
    state != null &&
    typeof state === "object" &&
    (state as Record<string, unknown>)[HOME_BELOW] === true
  );
};

/** Which tab is current: Home, a pinned section (Email for every /admin/mail* path), else More. */
const activeTab = (path: string, pinned: Section[]) => {
  if (path === "/admin") return "/admin";
  if (path.startsWith(MORE_HREF)) return MORE_HREF;
  const inMail = path === "/admin/mail" || path.startsWith("/admin/mail/");
  if (inMail && pinned.some((section) => section.href === "/admin/mail"))
    return "/admin/mail";
  const current = sectionFor(path);
  return (
    pinned.find((section) => section.href === current?.href)?.href ?? MORE_HREF
  );
};

// Explicit heights (spec §2.1 item 4): the bar's border box above the
// home-indicator inset equals --admin-tabbar (57px, 46px in landscape).
const BAR =
  "chrome fixed inset-x-0 bottom-0 z-40 box-content flex h-[calc(3.5625rem-2px)] items-stretch border-t-2 border-line bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] short:h-[calc(2.875rem-2px)] desk:hidden";

/** Fixed bottom nav on phones: Home, two role-aware pins, More. */
export function AdminTabBar({
  sections,
  path,
}: {
  sections: Section[];
  path: string;
}) {
  const { unread } = useAdminMail();
  const pinned = pinnedSections(sections);
  const active = activeTab(path, pinned);
  const prevPath = useRef(path);
  // The pathname a popstate landed on, until the next path change: an
  // arrival by traversal keeps whatever marker its entry already has.
  const poppedPath = useRef<string | null>(null);
  // Tab-to-tab switches replace the entry, dropping its state: carry it.
  const carryHomeBelow = useRef(false);
  // This path's base entry (not a stack entry) has Home below it.
  const marked = useRef(false);

  useEffect(() => {
    const onPop = () => {
      poppedPath.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const from = prevPath.current;
    prevPath.current = path;
    if (from === path) return;
    const popped = poppedPath.current === window.location.pathname;
    const carry = carryHomeBelow.current;
    poppedPath.current = null;
    carryHomeBelow.current = false;
    if (popped || path === "/admin") marked.current = homeBelow();
    else marked.current = homeBelow() || from === "/admin" || carry;
  }, [path]);

  // Put the marker on (again) after every commit: a same-path
  // router.replace (the mail inbox picker) or refresh writes Next's state
  // without it. Stack entries are skipped; Home below them is not adjacent.
  useEffect(() => {
    if (!marked.current || homeBelow()) return;
    const state = window.history.state as Record<string, unknown> | null;
    if (typeof state?.__stack === "string") return;
    window.history.replaceState({ ...state, [HOME_BELOW]: true }, "");
  });

  const tabs: Tab[] = [
    { href: "/admin", label: "Home", Icon: House },
    ...pinned.map((section) => ({
      href: section.href,
      label: section.name,
      Icon: SECTION_ICONS[section.href] ?? MoreHorizontal,
    })),
    { href: MORE_HREF, label: "More", Icon: MoreHorizontal },
  ];

  // Re-tapping the current tab: a stack screen may close (useStackParam), a
  // page may handle it; otherwise scroll to the top.
  const onTap = (event: React.MouseEvent, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (path !== href) {
      if (href === "/admin" && homeBelow()) {
        // Home is the entry below: go back to it, like a native tab bar.
        event.preventDefault();
        window.history.back();
      } else if (path !== "/admin" && href !== "/admin") {
        carryHomeBelow.current = homeBelow();
      }
      return;
    }
    event.preventDefault();
    const retap = new CustomEvent("admin:retap", {
      cancelable: true,
      detail: { href },
    });
    window.dispatchEvent(retap);
    if (retap.defaultPrevented) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
  };

  return (
    <nav aria-label="Admin sections" data-admin-tabbar className={BAR}>
      {tabs.map(({ href, label, Icon }) => {
        const current = href === active;
        const badge = href === "/admin/mail" && unread ? unread : 0;
        return (
          <Link
            key={href}
            href={href}
            // From Home a tab pushes; between the others it replaces. Home
            // goes back when it is the entry below (onTap), else replaces.
            replace={path !== "/admin"}
            aria-current={current ? "page" : undefined}
            onClick={(event) => onTap(event, href)}
            className="press-flat relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 font-bold text-subtle before:absolute before:inset-x-5 before:top-0 before:h-[3px] before:rounded-b aria-[current=page]:text-ink aria-[current=page]:before:bg-brand forced-colors:aria-[current=page]:border-b-2 forced-colors:aria-[current=page]:before:bg-[Highlight]"
          >
            <span className="relative">
              <Icon
                aria-hidden
                className={`size-6 ${current ? "text-brand" : ""}`}
              />
              {badge > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-1.5 left-1/2 ml-1.5 min-w-5 rounded-full border-2 border-line bg-brand px-1 text-center text-[11px] leading-4 text-brand-ink forced-colors:border-[CanvasText]"
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate text-[11px] leading-none short:sr-only">
              {label}
              {badge > 0 && <span className="sr-only">, {badge} unread</span>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The loading skeleton's tab bar: same box, four grey blocks. */
export function AdminTabBarPlaceholder() {
  return (
    <div aria-hidden className={BAR}>
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 opacity-40"
        >
          <span className="size-6 rounded-[8px] bg-line/40" />
          <span className="h-2 w-10 rounded-full bg-line/40 short:hidden" />
        </span>
      ))}
    </div>
  );
}
