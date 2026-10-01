"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Moon, Sun, X } from "lucide-react";
import { Logo } from "./logo";
import { DiscordButton } from "./discord-button";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { ThemeToggle, setTheme } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Team", href: "/team" },
  { name: "Events", href: "/events" },
  { name: "CS Guide", href: "/cs-guide" },
  { name: "Portal", href: "/admin", muted: true },
];

// Phones: 64px row under the status bar; md+: the 80px bar as before.
const gutters =
  "pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]";

const brand = (
  <>
    <Logo />
    <span className="text-[19px] font-bold tracking-wide whitespace-nowrap text-brand sm:text-[22px]">
      BROCK CSC
    </span>
  </>
);

const squareButton =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-line bg-surface text-ink";

/** Light/Dark as a segmented control. Mounted only inside the open menu. */
function ThemeRow() {
  const [theme, setLocalTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-base font-bold text-ink">Theme</span>
      <Segmented
        className="w-48"
        label="Theme"
        value={theme}
        onChange={(value) => {
          setTheme(value);
          setLocalTheme(value);
        }}
        options={[
          { value: "light", label: "Light", icon: Sun },
          { value: "dark", label: "Dark", icon: Moon },
        ]}
      />
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  // The menu is open for the page it was opened on, so a route change (a
  // row tap, back, a link elsewhere) closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const isMenuOpen = openAt === pathname;
  const closeMenu = () => setOpenAt(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-40 w-full border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] md:relative md:z-auto md:h-20 md:pt-0"
    >
      <div
        className={cn(
          "mx-auto flex h-16 w-full max-w-[1060px] items-center justify-between gap-3 md:h-full",
          gutters,
        )}
      >
        <Link href="/" className="flex cursor-pointer items-center gap-3">
          {brand}
        </Link>

        <div className="hidden items-center gap-6 text-[15px] font-bold whitespace-nowrap text-ink md:flex lg:gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "border-b-2 border-transparent pb-1 hover:text-brand pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center",
                link.muted && "text-subtle",
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
          aria-controls={isMenuOpen ? "mobile-nav-menu" : undefined}
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          aria-label="Open navigation menu"
          className={cn(squareButton, "active:bg-tint md:hidden")}
          onClick={() => setOpenAt(pathname)}
          ref={menuButton}
          type="button"
        >
          <span aria-hidden="true" className="relative h-4 w-5">
            <span className="absolute top-0 left-0 h-[2px] w-full bg-current" />
            <span className="absolute top-[7px] left-0 h-[2px] w-full bg-current" />
            <span className="absolute top-[14px] left-0 h-[2px] w-full bg-current" />
          </span>
        </button>
      </div>

      {/* A full-screen <dialog> (spec D20): the header row repeats inside it
          with the close X exactly where the hamburger was. */}
      <Sheet
        bare
        desktop="none"
        hideTitle
        id="mobile-nav-menu"
        onClose={closeMenu}
        open={isMenuOpen}
        presentation="full"
        title="Menu"
      >
        <div className="shrink-0 border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)]">
          <div
            className={cn(
              "flex h-16 items-center justify-between gap-3",
              gutters,
            )}
          >
            <Link
              href="/"
              className="flex items-center gap-3"
              onClick={closeMenu}
            >
              {brand}
            </Link>
            <button
              aria-label="Close navigation menu"
              className={cn(squareButton, "active:bg-tint")}
              onClick={closeMenu}
              type="button"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div
          data-scroll-allow
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
        >
          <ul>
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={closeMenu}
                    className={cn(
                      "press-flat relative flex min-h-12 items-center justify-between gap-3 py-2 text-lg font-bold",
                      gutters,
                      link.muted ? "text-subtle" : "text-ink",
                      active &&
                        "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand",
                    )}
                  >
                    {link.name}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-subtle"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={cn(
            "flex shrink-0 flex-col gap-4 border-t-2 border-line pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            gutters,
          )}
        >
          <DiscordButton className="h-12 w-full" />
          <ThemeRow />
        </div>
      </Sheet>
    </nav>
  );
}
