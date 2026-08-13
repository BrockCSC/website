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
  const [alsoDeleteAccount, setAlsoDeleteAccount] = useState(false);
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
      if (account && alsoDeleteAccount) {
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
            setAlsoDeleteAccount(false);
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

  const pendingColumns: ColumnDef<Signup>[] = [
    { header: "Name", cell: fullName },
    { header: "Username", accessorKey: "username" },
    { header: "Email", accessorKey: "email" },
    { header: "Phone", accessorKey: "phone" },
    {
      header: "Identity",
      cell: (signup) => {
        const match = signup.matchedExec;
        if (!match) {
          return (
            <span className="text-neutral-500">New — tile will be created</span>
          );
        }
        if (match.claimed) {
          return (
            <span className="font-semibold text-[#d44b4b]">
              Claims {match.name}, already held by another account
            </span>
          );
        }
        return (
          <span>
            Claims existing{" "}
            <strong>
              {match.name}
              {match.title ? ` — ${match.title}` : ""}
            </strong>
          </span>
        );
      },
    },
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
            <AdminTable
              columns={pendingColumns}
              data={pending}
              keyExtractor={(s) => s.$key}
            />
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
            <label className="mb-6 flex items-start gap-2 text-sm">
              <input
                checked={alsoDeleteAccount}
                className="mt-1"
                onChange={(e) => setAlsoDeleteAccount(e.target.checked)}
                type="checkbox"
              />
              <span>
                Also delete their login account (
                <span className="font-mono text-xs">
                  {deletingAccount.username}
                </span>
                ).
                <span className="block text-neutral-500">
                  Leave unchecked to keep the account — they stay able to log
                  in, but will have no tile until a co-president links one.
                </span>
              </span>
            </label>
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
