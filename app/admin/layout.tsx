"use client";

import { logout } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ChevronLeft, LogOut } from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkipLink } from "@/components/ui/skip-link";
import { ToastHost } from "@/components/ui/toast";
import { usePhone } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { SessionProvider, useSession } from "./session";
import { PaletteProvider, SearchButton } from "./palette";
import { AskHost } from "./ask";
import {
  ChromeProvider,
  useActiveTopBar,
  useAdminRootFlag,
  useDocumentTitle,
  useLargeTitle,
  useTypingFlag,
} from "./chrome";
import { AdminRail, AdminTabBar, AdminTabBarPlaceholder } from "./nav";
import { AdminPage } from "./page-frame";
import { sectionFor, visibleSections, type Section } from "./sections";

// Desk: today's header, 58px (36px buttons + 10px padding; 44px buttons +
// 6px on touch). Phone: sticky and solid, 44px content + 6px padding, which
// is what --admin-top in globals.css assumes.
const HEADER =
  "flex items-center gap-3 border-b-2 border-line px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 pointer-coarse:pt-[max(0.375rem,env(safe-area-inset-top))] pointer-coarse:pb-1.5 desk:px-6 phone:sticky phone:top-0 phone:z-30 phone:gap-1 phone:bg-surface phone:pt-[max(0.375rem,env(safe-area-inset-top))] phone:pr-[max(0.5rem,env(safe-area-inset-right))] phone:pb-1.5 phone:pl-[max(0.5rem,env(safe-area-inset-left))]";

const RAIL =
  "hidden desk:flex desk:flex-col desk:border-r-2 desk:border-line desk:max-lg:w-14 lg:w-52";

const DESK_BUTTON =
  "inline-flex h-9 items-center gap-1 rounded-[10px] border-2 border-line px-2 text-sm font-bold text-ink hover:bg-tint pointer-coarse:h-11 sm:px-3 phone:hidden";

function AdminHeader({
  path,
  section,
  mailAddress,
  onLogout,
}: {
  path: string;
  section: Section | undefined;
  mailAddress: string | null;
  onLogout: () => void;
}) {
  const router = useRouter();
  const phone = usePhone();
  const topBar = useActiveTopBar();
  const headerRef = useRef<HTMLElement>(null);
  const onMenu = path === "/admin";
  const back = topBar?.back;
  const title = topBar?.title ?? section?.name ?? (onMenu ? "Home" : undefined);
  const showTitle = useLargeTitle(
    phone && !back && topBar?.largeTitle !== false,
    headerRef,
    path,
  );
  useDocumentTitle(path, topBar?.docTitle);

  const goBack = () => {
    if (back?.onBack) back.onBack();
    else if (back?.href) router.push(back.href);
  };

  return (
    <header ref={headerRef} className={HEADER}>
      {back && (
        <button
          type="button"
          data-topbar-back
          onClick={goBack}
          className="press-flat -ml-1 inline-flex h-11 max-w-[9rem] shrink-0 items-center gap-0.5 rounded-[10px] px-1.5 font-bold text-ink desk:hidden"
        >
          {back.chevron !== false && (
            <ChevronLeft
              aria-hidden
              className="size-5 shrink-0"
              strokeWidth={2.5}
            />
          )}
          <span className="truncate">{back.label}</span>
        </button>
      )}

      {onMenu ? (
        <span
          className={cn(
            // Phone uses the large-title treatment like every other root.
            "flex items-center gap-2.5 phone:hidden",
          )}
        >
          <Image
            src="/badger-256.png"
            alt="BrockCSC"
            width={128}
            height={128}
            className="size-8 rounded-[8px] border-2 border-line"
          />
          <span className="font-extrabold text-ink">Admin</span>
        </span>
      ) : (
        section && (
          <span className="min-w-0 flex-1 truncate font-extrabold text-ink phone:hidden">
            {section.name}
          </span>
        )
      )}

      {/* Phone title. Root screens, Home included, keep it hidden until the
          page's h1 scrolls under the header (large title). */}
      {title != null && (
        <div
          aria-hidden={showTitle ? undefined : true}
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-[var(--dur)] ease-smooth desk:hidden",
            // A chevron-less back ("Cancel") needs its own gap, or it reads
            // as one phrase with the title.
            (!back || back.chevron === false) && "pl-2",
            !showTitle && "opacity-0",
          )}
        >
          <div className="truncate font-extrabold text-ink">{title}</div>
          {topBar?.subtitle != null && (
            <div className="truncate text-xs text-subtle">
              {topBar.subtitle}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 desk:gap-3 phone:gap-1">
        {mailAddress && (
          <span
            className="hidden max-w-[16rem] truncate text-sm font-semibold text-subtle lg:inline"
            title={`Signed in as ${mailAddress}`}
          >
            {mailAddress}
          </span>
        )}
        {topBar?.actions != null && (
          <div className="flex items-center gap-1 desk:hidden">
            {topBar.actions}
          </div>
        )}
        <span className={cn("contents", topBar?.hideSearch && "phone:hidden")}>
          <SearchButton />
        </span>
        <ThemeToggle className="size-9 pointer-coarse:size-11 phone:hidden" />
        <Link href="/site" aria-label="View site" className={DESK_BUTTON}>
          <ArrowUpRight className="size-4" aria-hidden />
          <span className="hidden sm:inline">View site</span>
        </Link>
        <button
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className={DESK_BUTTON}
        >
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );
}

/** Cold start: the shell's shape with pulsing rows, instead of a bare line. */
function ShellSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-svh flex-col">
      <span className="sr-only">Loading admin…</span>
      <div className={HEADER}>
        <span className="flex h-9 items-center pointer-coarse:h-11 phone:pl-2">
          <span className="h-5 w-32 animate-pulse rounded-[6px] bg-line/15" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={RAIL} />
        <div className="min-w-0 flex-1 pb-[calc(var(--admin-bottom)+1rem)] desk:pb-0">
          <AdminPage>
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-[16px] border-2 border-line/30"
                />
              ))}
            </div>
          </AdminPage>
        </div>
      </div>
      <AdminTabBarPlaceholder />
    </div>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // On the admin host, middleware rewrites / to /admin, so usePathname()
  // may say "/". Nothing in the shell reads the raw pathname.
  const path = pathname === "/" ? "/admin" : pathname;
  const { user, loading, refresh } = useSession();
  const [mailAddress, setMailAddress] = useState<string | null>(null);
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useAdminRootFlag(loading || Boolean(user?.isMember));
  useTypingFlag();

  useEffect(() => {
    if (!user?.isExecutive) return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        void fetch("/api/mail/keepalive", { method: "POST" });
      }
    };
    // Also right away: a tab reopened or refocused after a long gap should
    // not wait up to another 10 minutes to find out its mail session died.
    beat();
    const timer = setInterval(beat, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [user?.isExecutive]);

  useEffect(() => {
    if (!user?.isExecutive) return;
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email: string | null } | null) => {
        if (data) {
          setMailAddress(data.email);
          setHasMailbox(Boolean(data.email));
        }
      })
      .catch(() => {});
  }, [user?.isExecutive]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      await refresh();
      // Replace, so Back can't return to the admin.
      router.replace("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, [refresh, router]);

  if (loading) {
    return <ShellSkeleton />;
  }

  if (!user) {
    return <LoginForm onSuccess={() => void refresh()} />;
  }

  if (!user.isMember) {
    return (
      <div className="py-32 text-center">
        <p className="text-lg font-bold">Your access has been removed.</p>
        <p className="mt-2 text-sm text-subtle">
          Ask a co-president if you think this is a mistake. This page updates
          on its own if your roles come back.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 font-bold text-subtle underline hover:text-ink"
        >
          Log out
        </button>
      </div>
    );
  }

  const section = sectionFor(path);
  const sections = visibleSections(user, hasMailbox);

  return (
    <ChromeProvider
      hasMailbox={hasMailbox}
      mailAddress={mailAddress}
      onLogout={handleLogout}
    >
      <PaletteProvider hasMail={hasMailbox} onLogout={handleLogout}>
        <SkipLink />
        <div className="flex min-h-svh flex-col">
          <AdminHeader
            path={path}
            section={section}
            mailAddress={mailAddress}
            onLogout={handleLogout}
          />

          <div className="flex min-h-0 flex-1">
            <aside className={RAIL}>
              <AdminRail sections={sections} path={path} />
            </aside>
            {/* The document scrolls, not <main>. overflow-x-clip stops one wide
                child panning the page without making a scroll container, so
                sticky children keep working. Anything position:fixed that a
                page renders must be portaled to <body>: the fade-in animation
                makes <main> a stacking context, so its z-index can't rise above
                the shell's bars. */}
            <main
              id="main-content"
              className="min-w-0 flex-1 animate-fade-in overflow-x-clip pb-[calc(var(--admin-bottom)+1rem)] desk:pb-0"
              key={pathname}
            >
              {children}
            </main>
          </div>
          <AdminTabBar sections={sections} path={path} />
        </div>
        <ToastHost />
        <AskHost />
      </PaletteProvider>
    </ChromeProvider>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
