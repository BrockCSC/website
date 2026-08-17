"use client";

import { logout } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "@/components/admin/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionProvider, useSession } from "./session";
import { PaletteProvider, SearchButton } from "./palette";
import { sectionFor } from "./sections";

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, refresh } = useSession();
  const [mailAddress, setMailAddress] = useState<string | null>(null);

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
        if (data) setMailAddress(data.email);
      })
      .catch(() => {});
  }, [user?.isExecutive]);

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

  return (
    <PaletteProvider hasMail={Boolean(mailAddress)} onLogout={handleLogout}>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center gap-3 border-b-2 border-line px-4 py-2.5 sm:px-6">
          {onMenu ? (
            <span className="flex items-center gap-2.5">
              <Image
                src="/email-logo.png"
                alt="BrockCSC"
                width={32}
                height={32}
                className="size-8 rounded-[8px] border-2 border-line"
              />
              <span className="font-extrabold text-ink">Admin</span>
            </span>
          ) : (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-[10px] border-2 border-line px-3 py-1.5 text-sm font-bold text-ink hover:bg-tint"
            >
              <span aria-hidden>←</span> Menu
            </Link>
          )}
          {section && (
            <span className="truncate font-extrabold text-ink">
              {section.name}
            </span>
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
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="rounded-[10px] border-2 border-line px-3 py-1.5 text-sm font-bold text-ink hover:bg-tint"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 animate-fade-in" key={pathname}>
          {children}
        </main>
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
