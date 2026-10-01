"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAdminMail, useTopBar } from "./chrome";
import { AdminPage } from "./page-frame";

/**
 * An unknown /admin URL (via [...rest]) or a notFound() from an admin page.
 * Renders inside the admin shell, not the public site's Navbar and Footer.
 */
export default function AdminNotFound() {
  const { hasMailbox } = useAdminMail();
  useTopBar({ title: "Not found", docTitle: "Page not found" });

  return (
    <AdminPage width="narrow">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-subtle">
        404
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-ink">
        That screen isn&apos;t here.
      </h1>
      <p className="mt-2 text-subtle">
        The link may be out of date, or the screen may have moved.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="max-sm:w-full" size="lg">
          <Link href="/admin">Go to Home</Link>
        </Button>
        {hasMailbox === true && (
          <Button asChild className="max-sm:w-full" size="lg" variant="outline">
            <Link href="/admin/mail">Open Email</Link>
          </Button>
        )}
      </div>
    </AdminPage>
  );
}
