"use client";

import { logout } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";
import { SessionProvider, useSession } from "./session";

const adminTabs = [
  { name: "Dashboard", href: "/admin" },
  { name: "Events Management", href: "/admin/events", executiveOnly: true },
  { name: "Executives Management", href: "/admin/execs", approverOnly: true },
  { name: "Mail", href: "/admin/mail", executiveOnly: true, mailboxOnly: true },
  { name: "My Profile", href: "/admin/profile" },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, refresh } = useSession();
  const [mailAddress, setMailAddress] = useState<string | null>(null);
  // Only a clean answer of "no mailbox" hides Mail. An expired token or an
  // unreachable server must not, or the tab vanishes with nothing to click.
  const [hasMailbox, setHasMailbox] = useState(true);

  // Well inside Keycloak's 30 minute idle window, and again on returning to the
  // tab, which is what a closed laptop looks like from here.
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
        if (!data) return;
        setMailAddress(data.email);
        setHasMailbox(Boolean(data.email));
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
      <div className="py-32 text-center text-lg font-bold">
        Authenticating...
      </div>
    );
  }

  if (!user) {
    return <LoginForm onSuccess={() => void refresh()} />;
  }

  // Signed in, but every route behind here would refuse them.
  if (!user.isMember) {
    return (
      <div className="py-32 text-center">
        <p className="text-lg font-bold">Your access has been removed.</p>
        <p className="mt-2 text-sm text-neutral-600">
          Ask a co-president if you think this is a mistake. This page updates
          on its own if your roles come back.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 font-bold text-gray-500 underline hover:text-black"
        >
          Log out
        </button>
      </div>
    );
  }

  const wide = pathname.startsWith("/admin/mail");

  return (
    <div className="pt-6">
      <div
        className={`mx-auto w-full px-5 ${wide ? "max-w-[1600px]" : "max-w-[1060px]"}`}
      >
        <div className="flex items-center justify-between mb-8">
          <nav className="flex gap-2">
            {adminTabs
              .filter((tab) => !tab.approverOnly || user.isApprover)
              .filter((tab) => !tab.executiveOnly || user.isExecutive)
              .filter((tab) => !tab.mailboxOnly || hasMailbox)
              .map((tab) => {
                const isActive =
                  tab.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.name}
                    href={tab.href}
                    className={`px-4 py-2 rounded-[12px] font-semibold border-2 border-transparent transition-colors ${
                      isActive
                        ? "border-[#9A4440] text-[#9A4440] bg-[#fff1f0]"
                        : "text-black hover:bg-neutral-100"
                    }`}
                  >
                    {tab.name}
                  </Link>
                );
              })}
          </nav>
          <div className="flex items-center gap-3">
            {mailAddress && (
              <span
                className="hidden truncate text-sm font-semibold text-neutral-600 sm:inline"
                title={`Signed in as ${mailAddress}`}
              >
                {mailAddress}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="relative text-gray-500 font-bold px-4 py-2 hover:text-black transition-colors after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-[2px] after:bg-[#9A4440] after:origin-center after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
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
