"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportListing } from "@/lib/exports/types";
import { AdminPage } from "../page-frame";
import { useSession } from "../session";
import { Note } from "../users/ui";
import { fetchExports } from "./api";
import ExportCard from "./export-card";

const CONFIDENTIAL =
  "Exports marked Confidential contain personal information, like student numbers or signer names, so only send them to whoever needs them.";

export default function ExportsPage() {
  const { user } = useSession();
  const [listing, setListing] = useState<ExportListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user?.isApprover) return;
    void (async () => {
      try {
        setListing(await fetchExports());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.isApprover]);

  if (!user?.isApprover) {
    return (
      <AdminPage>
        <Note>Only a co-president can export club records.</Note>
      </AdminPage>
    );
  }

  return (
    <AdminPage className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Exports</h1>
        <p className="mt-1 max-w-prose text-subtle max-sm:hidden">
          Club records on letterhead, built fresh each time you download.
          Nothing is saved. {CONFIDENTIAL}
        </p>
        {/* Phones: one line, with the fine print a tap away (dash-11). */}
        <p className="mt-1 text-subtle sm:hidden">
          Club records on letterhead, built fresh each time. Nothing is saved.
        </p>
        <details className="group mt-1 text-sm sm:hidden">
          <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-1 font-bold text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 transition-transform duration-[var(--dur-fast)] ease-smooth group-open:rotate-90"
            />
            About confidential exports
          </summary>
          <p className="pb-1 text-subtle">{CONFIDENTIAL}</p>
        </details>
      </div>

      {loading && <p className="text-sm text-subtle">Loading exports…</p>}
      {error && <Note>Could not load exports right now.</Note>}

      {listing && (
        <div className="grid gap-4 sm:grid-cols-2">
          {listing.reports.map((report) => (
            <ExportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </AdminPage>
  );
}
