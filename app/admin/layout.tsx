"use client";

import { logout } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, LogOut } from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionProvider, useSession } from "./session";
import { PaletteProvider, SearchButton } from "./palette";
import { AskHost } from "./ask";
import { AdminRail, AdminTabBar } from "./nav";
import { sectionFor, visibleSections } from "./sections";

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, refresh } = useSession();
  const [mailAddress, setMailAddress] = useState<string | null>(null);
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.isExecutive) return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        void fetch("/api/mail/keepalive", { method: "POST" });
      }
    };
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

  useEffect(() => {
    const name = sectionFor(pathname)?.name;
    document.title = name ? `${name} | BrockCSC Admin` : "BrockCSC Admin";
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      await refresh();
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in py-32 text-center text-lg font-bold">
        Authenticating...
      </div>
    );
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

  const section = sectionFor(pathname);
  const onMenu = pathname === "/admin";
  const sections = visibleSections(user, hasMailbox);

  return (
    <PaletteProvider hasMail={hasMailbox} onLogout={handleLogout}>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center gap-3 border-b-2 border-line px-4 py-2.5 sm:px-6">
          {onMenu ? (
            <span className="flex items-center gap-2.5">
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
              <span className="min-w-0 flex-1 truncate font-extrabold text-ink">
                {section.name}
              </span>
            )
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {mailAddress && (
              <span
                className="hidden max-w-[16rem] truncate text-sm font-semibold text-subtle lg:inline"
                title={`Signed in as ${mailAddress}`}
              >
                {mailAddress}
              </span>
            )}
            <SearchButton />
            <ThemeToggle className="size-9" />
            <Link
              href="/site"
              aria-label="View site"
              className="inline-flex h-9 items-center gap-1 rounded-[10px] border-2 border-line px-2 text-sm font-bold text-ink hover:bg-tint sm:px-3"
            >
              <ArrowUpRight className="size-4" aria-hidden />
              <span className="hidden sm:inline">View site</span>
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="inline-flex h-9 items-center gap-1 rounded-[10px] border-2 border-line px-2 text-sm font-bold text-ink hover:bg-tint sm:px-3"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden md:flex md:w-14 md:flex-col md:border-r-2 md:border-line lg:w-52">
            <AdminRail sections={sections} pathname={pathname} />
          </aside>
          <main
            className="min-h-0 flex-1 animate-fade-in overflow-y-auto pb-16 md:pb-0"
            key={pathname}
          >
            {children}
          </main>
        </div>
        <AdminTabBar sections={sections} pathname={pathname} />
        <AskHost />
      </div>
    </PaletteProvider>
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
