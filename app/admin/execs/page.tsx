"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import {
  deleteExec,
  deleteSignup,
  ExecRecord,
  fetchCurrentExecs,
  fetchInviteCode,
  fetchPreviousExecs,
  fetchSignups,
  reviewSignup,
  SignupRecord,
  WithKey,
} from "@/lib/api";
import { sortCurrentExecsByRoleThenDatabaseOrder } from "@/lib/execs/order";
import ExecModal from "./exec-modal";
import Modal, { ConfirmationModal } from "@/components/ui/modal";
import { AdminTable, ColumnDef } from "@/components/ui/admin-table";

type TeamMember = WithKey<ExecRecord>;
type ExecMatch = {
  execKey: string;
  name: string;
  title?: string;
  claimed: boolean;
};
type Signup = WithKey<SignupRecord> & { matchedExec?: ExecMatch | null };

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

export default function ExecutivesManagementPage() {
  const [currentExecs, setCurrentExecs] = useState<TeamMember[]>([]);
  const [previousExecs, setPreviousExecs] = useState<TeamMember[]>([]);
  const [signups, setSignups] = useState<Signup[] | null>(null);
  const [invite, setInvite] = useState<{
    code: string;
    expiresInMs: number;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedExec, setSelectedExec] = useState<TeamMember | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const [rejecting, setRejecting] = useState<Signup | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Only approvers can read sign-ups; plain admins just see the tiles. */
  const isApprover = signups !== null;
  const accountFor = (exec: TeamMember) =>
    signups?.find((signup) => signup.execKey === exec.$key) ?? null;

  const load = async () => {
    const [current, previous] = await Promise.all([
      fetchCurrentExecs(),
      fetchPreviousExecs(),
    ]);
    setCurrentExecs(sortCurrentExecsByRoleThenDatabaseOrder(current));
    setPreviousExecs(previous);
    try {
      setSignups(await fetchSignups());
    } catch {
      setSignups(null);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        setError("Could not load the executive team right now.");
      }
      try {
        setInvite(await fetchInviteCode());
      } catch {
        setInvite(null);
      }
    })();
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

  const confirmDelete = async () => {
    if (!deleting) return;
    const tile = deleting;
    const account = accountFor(tile);
    setDeleting(null);
    setError(null);
    try {
      if (account) {
        await deleteSignup(account.$key, true);
      } else {
        await deleteExec(tile.$key);
      }
      await load();
    } catch {
      setError(`Could not delete ${tile.name ?? "that executive"}.`);
    }
  };

  const accountColumn: ColumnDef<TeamMember> = {
    header: "Account",
    cell: (exec) => {
      const account = accountFor(exec);
      if (!account) {
        return <span className="text-neutral-400">No login</span>;
      }
      return (
        <span>
          <span className="font-mono text-xs">{account.username}</span>
          {account.status !== "approved" && (
            <span className="ml-2 text-xs font-semibold text-[#d44b4b]">
              {account.status}
            </span>
          )}
        </span>
      );
    },
  };

  const actionsColumn: ColumnDef<TeamMember> = {
    header: "Actions",
    headerClassName: "text-center",
    cellClassName: "flex justify-around gap-[15px]",
    cell: (exec) => (
      <>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setSelectedExec(exec);
            setShowModal(true);
          }}
        >
          EDIT
        </Button>
        <Button
          variant="link"
          className="text-red-600"
          size="sm"
          onClick={() => {
            setDeleting(exec);
          }}
        >
          Delete
        </Button>
      </>
    ),
  };

  const standardColumns: ColumnDef<TeamMember>[] = [
    {
      header: "Name",
      accessorKey: "name",
      cellClassName: "max-w-[12rem] truncate",
    },
    { header: "Role", accessorKey: "title" },
    ...(isApprover ? [accountColumn] : []),
    actionsColumn,
  ];

  const pendingCard = (signup: Signup) => {
    const match = signup.matchedExec;
    return (
      <div
        className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#9A4440]"
        key={signup.$key}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-bold">{fullName(signup)}</div>
            <div className="font-mono text-xs text-neutral-500">
              {signup.username}
            </div>
          </div>
          <div className="flex shrink-0 gap-3">
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
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
          {signup.email && <span className="break-all">{signup.email}</span>}
          {signup.phone && <span>{signup.phone}</span>}
          {signup.submittedAt && (
            <span>{new Date(signup.submittedAt).toLocaleDateString()}</span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="rounded-[12px] bg-neutral-100 px-4 py-3 text-sm">
            {!match && (
              <span className="text-neutral-600">
                No matching tile — a new one will be created on approval.
              </span>
            )}
            {match && match.claimed && (
              <span className="font-semibold text-[#d44b4b]">
                Claims {match.name}, already held by another account. Approving
                creates a separate tile.
              </span>
            )}
            {match && !match.claimed && (
              <span>
                Claims existing{" "}
                <strong>
                  {match.name}
                  {match.title ? ` — ${match.title}` : ""}
                </strong>
              </span>
            )}
          </div>

          {signup.confirmationCode && (
            <div className="rounded-[12px] border-2 border-black bg-[#fff1f0] px-4 py-2 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Confirm code
              </div>
              <div className="font-mono text-lg font-bold tracking-[0.2em] text-[#9A4440]">
                {signup.confirmationCode}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const pending = (signups ?? []).filter((s) => s.status === "pending");
  const deletingAccount = deleting ? accountFor(deleting) : null;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold mb-2">Executive Management</h1>
        <p className="text-neutral-500 mb-6">
          The executive team, their team page tiles, and the login accounts
          attached to them.
        </p>

        {error && (
          <div className="mb-6 rounded-[12px] border-2 border-[#d44b4b] px-4 py-2 font-semibold text-[#d44b4b]">
            {error}
          </div>
        )}

        <div className="mb-8 rounded-2xl border-2 border-black bg-[#fff1f0] shadow-[4px_4px_0px_#9A4440] p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Current invite code
          </div>
          <div className="text-3xl font-bold tracking-[0.2em] text-[#9A4440] my-1">
            {invite?.code ?? "————————"}
          </div>
          <div className="text-sm text-neutral-600">
            {invite
              ? `Rotates in ${humanise(invite.expiresInMs)} — share it with execs who need an account`
              : "Unavailable"}
          </div>
        </div>

        {isApprover && pending.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-bold mb-4">
              Pending sign-ups ({pending.length})
            </h2>
            <div className="flex flex-col gap-4">
              {pending.map(pendingCard)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="primary"
            onClick={() => {
              setSelectedExec(null);
              setShowModal(true);
            }}
          >
            Add Executive
          </Button>
        </div>

        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">Current Executive</h2>
          <AdminTable
            columns={standardColumns}
            data={currentExecs}
            keyExtractor={(e) => e.$key}
          />
          <div className="mt-2 text-right text-xs text-neutral-500 font-semibold">
            {currentExecs.length} active members
          </div>
        </div>

        <div className="mb-10 border-t-2 border-black pt-6">
          <button
            className="flex items-center gap-2 text-xl font-bold mb-4 hover:opacity-80 transition-opacity"
            onClick={() => setShowPast(!showPast)}
          >
            {showPast ? "Hide" : "Show"} Past Executives {showPast ? "▲" : "▼"}
          </button>
          {showPast && (
            <div className="mt-4">
              <h2 className="text-lg font-bold mb-4">Past Executives</h2>
              <AdminTable
                columns={standardColumns}
                data={previousExecs}
                keyExtractor={(e) => e.$key}
              />
              <div className="mt-2 text-right text-xs text-neutral-500 font-semibold">
                {previousExecs.length} past members
              </div>
            </div>
          )}
        </div>
      </div>

      {deleting && (
        <Modal
          open={!!deleting}
          title="Delete executive"
          onClose={() => setDeleting(null)}
        >
          <p className="mb-4 mt-[-15px]">
            Removes <strong>{deleting.name}</strong> from the team page. This
            cannot be undone.
          </p>

          {deletingAccount ? (
            <p className="mb-6 rounded-[12px] border-2 border-[#d44b4b] px-4 py-3 text-sm font-semibold text-[#d44b4b]">
              Their login account (
              <span className="font-mono">{deletingAccount.username}</span>)
              will be deleted too. They will no longer be able to sign in.
            </p>
          ) : (
            <p className="mb-6 text-sm text-neutral-500">
              No login account is attached to this tile.
            </p>
          )}

          <div className="flex justify-end gap-4">
            <Button onClick={() => setDeleting(null)} variant="secondary">
              Cancel
            </Button>
            <Button onClick={confirmDelete} variant="destructive">
              Delete
            </Button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <ConfirmationModal
          open={!!rejecting}
          title="Confirm Rejection"
          message={`Rejecting ${fullName(rejecting)} permanently deletes their Keycloak account. This cannot be undone.`}
          onConfirm={() => review(rejecting, "reject")}
          onClose={() => setRejecting(null)}
        />
      )}

      {showModal && (
        <ExecModal
          showModal={showModal}
          setShowModal={setShowModal}
          selectedExec={selectedExec}
          onSave={() => void load()}
        />
      )}
    </>
  );
}
