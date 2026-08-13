import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll } from "./repository";
import { execsTable, signupsTable } from "./schema";

const normalise = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export type ExecMatch = {
  execKey: string;
  name: string;
  title?: string;
  /** Another account already holds this tile, so it cannot be auto-linked. */
  claimed: boolean;
};

/**
 * Finds the team-page tile belonging to a name. Approval uses this to link an
 * account to the identity it claims, so the approver is the one who decides
 * whether the claim is genuine.
 */
export const findExecMatchingName = async (
  firstName = "",
  lastName = "",
): Promise<ExecMatch | null> => {
  const wanted = normalise(`${firstName} ${lastName}`);
  if (!wanted) return null;

  const execs = await findAll<ExecRecord>(execsTable);
  const match = execs.find((exec) => normalise(exec.name ?? "") === wanted);
  if (!match) return null;

  const signups = await findAll<SignupRecord>(signupsTable);
  return {
    execKey: match.id,
    name: match.name ?? "",
    title: match.title,
    claimed: signups.some((signup) => signup.execKey === match.id),
  };
};
