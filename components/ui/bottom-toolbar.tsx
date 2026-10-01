"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useChromeFlag } from "@/lib/use-chrome-flag";
import { cn } from "@/lib/utils";

export type ToolbarItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress?: () => void;
  href?: string;
  /** Brand fill. At most one, placed last. */
  primary?: boolean;
  /** Glyph and label in the destructive colour, never filled. */
  destructive?: boolean;
  disabled?: boolean;
  /** Toggle state (aria-pressed), e.g. a flag. */
  pressed?: boolean;
};

type BottomToolbarProps = {
  items: ToolbarItem[];
  /** Names the group, e.g. "Message actions". */
  label: string;
  leading?: React.ReactNode;
};

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const itemBase =
  "flex min-h-12 min-w-0 flex-1 short:min-h-0 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1";

function Item({ item }: { item: ToolbarItem }) {
  const Icon = item.icon;
  const className = cn(
    itemBase,
    item.primary
      ? // Landscape drops the labels: a compact icon pill, not a fifth of the bar.
        "press rounded-[16px] border-2 border-line bg-brand text-brand-ink shadow-brut-sm forced-colors:border-[ButtonText] short:min-w-20 short:flex-none short:px-5"
      : "press-flat aria-pressed:bg-tint",
    !item.primary && (item.destructive ? "text-destructive" : "text-ink"),
    item.disabled && "cursor-default opacity-40",
  );
  const content = (
    <>
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="line-clamp-2 text-center text-[11px] leading-tight font-bold short:sr-only">
        {item.label}
      </span>
    </>
  );

  if (item.href && !item.disabled) {
    return (
      <Link href={item.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-disabled={item.disabled || undefined}
      aria-pressed={item.pressed}
      onClick={item.disabled ? undefined : item.onPress}
      className={className}
    >
      {content}
    </button>
  );
}

/**
 * The phone action bar in the tab bar's slot (message, selection modes,
 * placement). Portaled to <body>, since <main> is a stacking context.
 * Mounting it hides the tab bar and sets --admin-toolbar.
 */
export function BottomToolbar({ items, label, leading }: BottomToolbarProps) {
  useChromeFlag("toolbar", true);
  const isClient = useIsClient();
  if (!isClient) return null;

  return createPortal(
    <div
      role="group"
      aria-label={label}
      className="chrome fixed inset-x-0 bottom-0 z-40 box-content flex h-14 items-stretch short:h-[38px] short:pt-0.5 gap-1 border-t-2 border-line bg-surface pt-1 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:hidden [:root[data-kb-open]_&]:hidden"
    >
      {leading}
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
    </div>,
    document.body,
  );
}
