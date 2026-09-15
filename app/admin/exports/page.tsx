"use client";

import { useEffect, useState } from "react";
import type { ExportListing } from "@/lib/exports/types";
import { useSession } from "../session";
import { Note } from "../users/ui";
import { fetchExports } from "./api";
import ExportCard from "./export-card";

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
      <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
        <Note>Only a co-president can export club records.</Note>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Exports</h1>
        <p className="mt-1 max-w-prose text-subtle">
          Club records on letterhead, built fresh each time you download.
          Nothing is saved. Exports marked Confidential contain personal
          information, like student numbers or signer names, so only send them
          to whoever needs them.
        </p>
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
    </div>
  );
}
