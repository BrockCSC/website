"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import {
  deleteExec,
  ExecRecord,
  fetchCurrentExecs,
  fetchPreviousExecs,
  WithKey,
} from "@/lib/api";
import { sortCurrentExecsByRoleThenDatabaseOrder } from "@/lib/execs/order";
import ExecModal from "./exec-modal";
import { ConfirmationModal } from "@/components/ui/modal";
import { AdminTable, ColumnDef } from "@/components/ui/admin-table";

type TeamMember = WithKey<ExecRecord>;

export default function ExecutivesManagementPage() {
  const [currentExecs, setCurrentExecs] = useState<TeamMember[]>([]);
  const [previousExecs, setPreviousExecs] = useState<TeamMember[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedExec, setSelectedExec] = useState<TeamMember | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [openConfirmationModel, setOpenConfirmationModel] = useState(false);

  const actionsColumn: ColumnDef<(typeof currentExecs)[0]> = {
    header: "Actions",
    headerClassName: "text-center",
    cellClassName: "flex justify-around gap-[15px]",
    cell: (event) => (
      <>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setSelectedExec(event);
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
            setSelectedExec(event);
            setOpenConfirmationModel(true);
          }}
        >
          Delete
        </Button>
      </>
    ),
  };

  const standardColumns: ColumnDef<(typeof currentExecs)[0]>[] = [
    {
      header: "Name",
      accessorKey: "name",
      cellClassName: "max-w-[12rem] truncate",
    },
    { header: "Role", accessorKey: "title" },
    actionsColumn,
  ];

  const loadTeam = async (isActive: () => boolean = () => true) => {
    try {
      const [current, previous] = await Promise.all([
        fetchCurrentExecs(),
        fetchPreviousExecs(),
      ]);

      if (!isActive()) {
        return;
      }

      setCurrentExecs(sortCurrentExecsByRoleThenDatabaseOrder(current));
      setPreviousExecs(previous);
    } catch {
      if (!isActive()) {
        return;
      }
      console.error("Could not load team members right now.");
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadTeam(() => active);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold mb-2">Executive Management</h1>
        <p className="text-neutral-500 mb-6">
          Central dashboard to oversee the executive team, update roles, and add
          new executive members for the Brock Computer Science Club.
        </p>

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

      {openConfirmationModel && (
        <ConfirmationModal
          open={openConfirmationModel}
          title="Confirm Deletion"
          message="Are you sure you want to delete this executive? This action cannot be undone."
          onConfirm={async () => {
            if (!selectedExec?.$key) return;
            await deleteExec(selectedExec.$key);
            loadTeam();
          }}
          onClose={() => setOpenConfirmationModel(false)}
        />
      )}

      {showModal && (
        <ExecModal
          showModal={showModal}
          setShowModal={setShowModal}
          selectedExec={selectedExec}
          onSave={() => void loadTeam()}
        />
      )}
    </>
  );
}
