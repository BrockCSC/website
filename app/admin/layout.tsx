"use client";

import { fetchCurrentUser, logout } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";

const adminTabs = [
  { name: "Dashboard", href: "/admin" },
  { name: "Events Management", href: "/admin/events" },
  { name: "Executives Management", href: "/admin/execs" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser().then((user) => {
      if (cancelled) return;
      setAuthenticated(!!user);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setAuthenticated(false);
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

  if (!authenticated) {
    return <LoginForm onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="pt-8">
      <div className="mx-auto w-full max-w-[1060px] px-5">
        <div className="flex items-center justify-between mb-8">
          <nav className="flex gap-2">
            {adminTabs.map((tab) => {
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
