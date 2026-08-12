"use client";

import { useEffect, useState } from "react";
import {
  fetchInviteCode,
  fetchSignups,
  reviewSignup,
  SignupRecord,
  WithKey,
} from "@/lib/api";
import { AdminTable, ColumnDef } from "@/components/ui/admin-table";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/modal";

type Signup = WithKey<SignupRecord>;

const humanise = (ms: number): string => {
  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ] as const;
  for (const [name, size] of units) {
    const count = Math.floor(ms / size);
    if (count >= 1) return `${count} ${name}${count === 1 ? "" : "s"}`;
  }
  return "under a minute";
};

const fullName = (signup: Signup) =>
  [signup.firstName, signup.lastName].filter(Boolean).join(" ");

const submittedOn = (signup: Signup) =>
  signup.submittedAt ? new Date(signup.submittedAt).toLocaleDateString() : "—";

export default function SignupRequestsPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [invite, setInvite] = useState<{
    code: string;
    expiresInMs: number;
  } | null>(null);
  const [rejecting, setRejecting] = useState<Signup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setSignups(await fetchSignups());
    } catch {
      setError("Could not load sign-up requests right now.");
    }
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    void fetchInviteCode()
      .then(setInvite)
      .catch(() => setInvite(null));
  }, []);

  const review = async (signup: Signup, action: "approve" | "reject") => {
    setError(null);
    try {
      await reviewSignup(signup.$key, action);
      await load();
    } catch {
      setError(`Could not ${action} ${fullName(signup)}. Please try again.`);
    }
  };

  const details: ColumnDef<Signup>[] = [
    { header: "Name", cell: fullName },
    { header: "Username", accessorKey: "username" },
    { header: "Email", accessorKey: "email" },
    { header: "Phone", accessorKey: "phone" },
    { header: "Submitted", cell: submittedOn },
  ];

  const pendingColumns: ColumnDef<Signup>[] = [
    ...details,
    {
      header: "Actions",
      headerClassName: "text-center",
      cellClassName: "flex justify-around gap-[15px]",
      cell: (signup) => (
        <>
          <Button size="xs" onClick={() => review(signup, "approve")}>
            Approve
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => setRejecting(signup)}
          >
            Reject
          </Button>
        </>
      ),
    },
  ];

  const processedColumns: ColumnDef<Signup>[] = [
    ...details,
    { header: "Status", accessorKey: "status" },
    { header: "Reviewed by", accessorKey: "reviewedBy" },
  ];

  const pending = signups.filter((signup) => signup.status === "pending");
  const processed = signups.filter((signup) => signup.status !== "pending");

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold mb-2">Sign-up Requests</h1>
        <p className="text-neutral-500 mb-6">
          Review executive sign-ups. Approving enables the account; rejecting
          deletes it.
        </p>

        <div className="mb-8 rounded-2xl border-2 border-black bg-[#fff1f0] shadow-[4px_4px_0px_#9A4440] p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Current invite code
          </div>
          <div className="text-3xl font-bold tracking-[0.2em] text-[#9A4440] my-1">
            {invite?.code ?? "————————"}
          </div>
          <div className="text-sm text-neutral-600">
            {invite
              ? `Rotates in ${humanise(invite.expiresInMs)}`
              : "Unavailable"}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[12px] border-2 border-[#d44b4b] px-4 py-2 font-semibold text-[#d44b4b]">
            {error}
          </div>
        )}

        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">Pending</h2>
          <AdminTable
            columns={pendingColumns}
            data={pending}
            keyExtractor={(s) => s.$key}
          />
          <div className="mt-2 text-right text-xs text-neutral-500 font-semibold">
            {pending.length} awaiting review
          </div>
        </div>

        <div className="mb-10 border-t-2 border-black pt-6">
          <h2 className="text-lg font-bold mb-4">Processed</h2>
          <AdminTable
            columns={processedColumns}
            data={processed}
            keyExtractor={(s) => s.$key}
          />
        </div>
      </div>

      {rejecting && (
        <ConfirmationModal
          open={!!rejecting}
          title="Confirm Rejection"
          message={`Rejecting ${fullName(rejecting)} permanently deletes their Keycloak account. This cannot be undone.`}
          onConfirm={() => review(rejecting, "reject")}
          onClose={() => setRejecting(null)}
        />
      )}
    </>
  );
}
