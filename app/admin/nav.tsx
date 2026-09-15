"use client";

import Image from "next/image";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { SECTION_ICONS } from "./icons";
import { usePalette } from "./palette";
import { sectionFor, type Section } from "./sections";

/** Persistent md+ nav: icon-only until lg, full icon+label at lg+. */
export function AdminRail({
  sections,
  pathname,
}: {
  sections: Section[];
  pathname: string;
}) {
  const current = sectionFor(pathname);
  const atHome = pathname === "/admin";

  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
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
            className={`flex min-h-9 items-center justify-center gap-3 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors duration-[var(--dur)] ease-smooth lg:justify-start ${
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

/** Fixed bottom nav below md: home, two pinned sections, and the palette for everything else. */
export function AdminTabBar({
  sections,
  pathname,
}: {
  sections: Section[];
  pathname: string;
}) {
  const { open } = usePalette();
  const pinned = sections.slice(0, 2);
  const current = sectionFor(pathname);
  const atHome = pathname === "/admin";

  return (
    <nav
      aria-label="Admin sections"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link
        href="/admin"
        aria-current={atHome ? "page" : undefined}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold ${
          atHome ? "text-brand" : "text-subtle"
        }`}
      >
        <Image
          src="/badger-256.png"
          alt=""
          width={128}
          height={128}
          className="size-5"
          aria-hidden
        />
        Home
      </Link>
      {pinned.map((section) => {
        const Icon = SECTION_ICONS[section.href];
        const active = section.href === current?.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold ${
              active ? "text-brand" : "text-subtle"
            }`}
          >
            {Icon && <Icon className="size-5" />}
            {section.name}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={open}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold text-subtle"
      >
        <MoreHorizontal className="size-5" aria-hidden />
        More
      </button>
    </nav>
  );
}
