"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { DiscordButton } from "./discord-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Team", href: "/team" },
  { name: "Events", href: "/events" },
  { name: "CS Guide", href: "/cs-guide" },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  return (
    <nav
      aria-label="Main"
      className="relative h-20 w-full border-b-2 border-line bg-surface"
    >
      <div className="mx-auto flex h-full w-full max-w-[1060px] items-center justify-between gap-3 px-5">
        <Link href="/" className="flex cursor-pointer items-center gap-3">
          <Logo />
          <span className="text-[19px] font-bold tracking-wide text-brand sm:text-[22px]">
            BROCK CSC
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[15px] font-bold text-ink md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "border-b-2 border-transparent pb-1 hover:text-brand",
                isActive(link.href) && "border-brand text-brand",
              )}
            >
              {link.name}
            </Link>
          ))}

          <div className="ml-2 flex items-center gap-3">
            <ThemeToggle />
            <DiscordButton />
          </div>
        </div>

        <button
          aria-controls="mobile-nav-menu"
          aria-expanded={isMenuOpen}
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-line bg-surface text-ink md:hidden"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          ref={menuButton}
          type="button"
        >
          <span className="relative h-4 w-5">
            <span
              className={cn(
                "absolute left-0 top-0 h-[2px] w-full bg-current transition-transform duration-[var(--dur)] ease-smooth",
                isMenuOpen && "translate-y-[7px] rotate-45",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[7px] h-[2px] w-full bg-current transition-opacity duration-[var(--dur-fast)] ease-smooth",
                isMenuOpen && "opacity-0",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[14px] h-[2px] w-full bg-current transition-transform duration-[var(--dur)] ease-smooth",
                isMenuOpen && "-translate-y-[7px] -rotate-45",
              )}
            />
          </span>
        </button>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 top-full z-50 border-b-2 border-line bg-surface transition-[opacity,transform,visibility] duration-[var(--dur-slow)] ease-smooth md:hidden",
          isMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-3 opacity-0 motion-reduce:translate-y-0",
        )}
        id="mobile-nav-menu"
      >
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-1 px-5 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                "rounded-[10px] border-2 border-transparent px-3 py-2.5 text-base font-semibold text-ink",
                isActive(link.href)
                  ? "border-brand bg-tint text-brand"
                  : "hover:bg-tint",
              )}
            >
              {link.name}
            </Link>
          ))}
          <div className="mt-2 flex items-center gap-3">
            <ThemeToggle className="shrink-0" />
            <div className="flex-1" onClick={() => setIsMenuOpen(false)}>
              <DiscordButton className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
