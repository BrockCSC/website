"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { DiscordButton } from "./discord-button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Team", href: "/team" },
    { name: "Events", href: "/events" },
    { name: "CS Guide", href: "/cs-guide" },
  ];

  return (
    <nav className="relative h-20 w-full border-b-2 border-black bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1060px] items-center justify-between px-5">
        <Link href="/" className="flex cursor-pointer items-center gap-3">
          <Logo />
          <span className="text-[22px] font-bold tracking-wide text-[#9A4440]">
            BROCK CSC
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[15px] font-bold text-[#1a1a1a] md:flex">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "border-b-2 border-transparent pb-1 transition-colors hover:text-[#9A4440]",
                  isActive && "border-[#9A4440] text-[#9A4440]",
                )}
              >
                {link.name}
              </Link>
            );
          })}

          <DiscordButton className="ml-2" />
        </div>

        <button
          aria-controls="mobile-nav-menu"
          aria-expanded={isMenuOpen}
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border-2 border-black bg-white text-[#1a1a1a] md:hidden"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          type="button"
        >
          <span className="relative h-4 w-5">
            <span
              className={cn(
                "absolute left-0 top-0 h-[2px] w-full bg-current transition-transform",
                isMenuOpen && "translate-y-[7px] rotate-45",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[7px] h-[2px] w-full bg-current transition-opacity",
                isMenuOpen && "opacity-0",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[14px] h-[2px] w-full bg-current transition-transform",
                isMenuOpen && "-translate-y-[7px] -rotate-45",
              )}
            />
          </span>
        </button>
      </div>

      <div
        className={cn(
          "absolute inset-x-0 top-full z-50 border-b-2 border-black bg-white md:hidden",
          isMenuOpen ? "block" : "hidden",
        )}
        id="mobile-nav-menu"
      >
        <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-1 px-5 py-4">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "rounded-[10px] border-2 border-transparent px-3 py-2 text-base font-semibold text-[#1a1a1a] transition-colors",
                  isActive
                    ? "border-[#9A4440] bg-[#fff1f0] text-[#9A4440]"
                    : "hover:bg-muted",
                )}
              >
                {link.name}
              </Link>
            );
          })}
          <div className="mt-2 w-full" onClick={() => setIsMenuOpen(false)}>
            <DiscordButton className="w-full" />
          </div>
        </div>
      </div>
    </nav>
  );
}
