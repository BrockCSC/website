"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type FabProps = {
  icon: LucideIcon;
  /** Always the accessible name; also the visible text when extended. */
  label: string;
  /** Show the label next to the icon. */
  extended?: boolean;
  /** Extended only: collapse to the icon on scroll down, expand on scroll up. Default true. */
  collapseOnScroll?: boolean;
  hidden?: boolean;
} & ({ onPress: () => void; href?: never } | { href: string; onPress?: never });

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const THRESHOLD = 24;

const buttonClass =
  "press inline-flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-[16px] border-2 border-line bg-brand px-4 font-extrabold text-brand-ink shadow-brut";

/**
 * The phone floating action button (Compose, New event). Portaled to <body>.
 * It sits above the bottom chrome and lifts above a visible toast
 * (--toast-h). Lists under it pad their end with pb-24.
 */
export function Fab({
  icon: Icon,
  label,
  extended = false,
  collapseOnScroll = true,
  hidden = false,
  ...target
}: FabProps) {
  const isClient = useIsClient();
  const [collapsed, setCollapsed] = useState(false);
  const watchScroll = extended && collapseOnScroll && !hidden;

  useEffect(() => {
    if (!watchScroll) return;
    let last = window.scrollY;
    // Distance travelled in the current direction.
    let run = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      if (y <= 0) {
        run = 0;
        setCollapsed(false);
        return;
      }
      run = Math.sign(delta) === Math.sign(run) ? run + delta : delta;
      if (run > THRESHOLD) setCollapsed(true);
      else if (run < -THRESHOLD) setCollapsed(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [watchScroll]);

  if (!isClient || hidden) return null;

  const showLabel = extended && !(watchScroll && collapsed);
  const content = (
    <>
      <Icon aria-hidden className="size-6 shrink-0" strokeWidth={2.25} />
      {showLabel && <span aria-hidden>{label}</span>}
    </>
  );

  // The wrapper owns the position and the lift transition; the button owns
  // the press transition.
  return createPortal(
    <div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--chrome-bottom)+1rem+var(--toast-h,0px))] z-30 transition-[bottom] duration-200 desk:hidden">
      {target.href != null ? (
        <Link href={target.href} aria-label={label} className={buttonClass}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          onClick={target.onPress}
          className={buttonClass}
        >
          {content}
        </button>
      )}
    </div>,
    document.body,
  );
}
