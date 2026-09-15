import { and, eq, sql, type SQL } from "drizzle-orm";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { currentTerm, servingTerm, termFields } from "@/lib/execs/terms";
import { db } from "./index";
import { findAll, toEntity, type Entity } from "./repository";
import { execsTable, signupsTable } from "./schema";

const normalise = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

type ExecMatch = {
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

/**
 * A tile marked current with no term on file. A `term`/`terms` of the wrong JSON type is
 * left alone rather than overwritten, so bad data is never silently replaced.
 */
const missingTerm: SQL = sql`${execsTable.data}->'isCurrentExec' = 'true'::jsonb
  and coalesce(${execsTable.data}->'terms', '[]'::jsonb) = '[]'::jsonb
  and coalesce(jsonb_typeof(${execsTable.data}->'term'), 'null') in ('null', 'string')
  and btrim(coalesce(${execsTable.data}->>'term', '')) = ''`;

const stampTerm = async (
  term: string,
  where: SQL,
): Promise<Entity<ExecRecord>[]> => {
  const rows = await db
    .update(execsTable)
    .set({
      data: sql`${execsTable.data} || ${JSON.stringify(termFields([term]))}::jsonb`,
    })
    .where(where)
    .returning();
  return rows.map((row) => toEntity<ExecRecord>(row));
};

/**
 * Gives one tile the term it should be serving, if it has none. One statement, so a term saved in between is never overwritten.
 * Written as someone joins or returns, so from April it is the incoming year they are joining for.
 */
export const fillMissingTerm = async (
  exec: Entity<ExecRecord>,
  now = new Date(),
): Promise<Entity<ExecRecord>> =>
  (
    await stampTerm(
      servingTerm(now),
      and(eq(execsTable.id, exec.id), missingTerm)!,
    )
  )[0] ?? exec;

/**
 * The same for every current tile, at boot. Returns the ids it changed. These tiles have
 * been on the team for a while, so they get the year now, not the one servingTerm() hands
 * a summer arrival: a tile is only stamped once, and the wrong year has to be fixed by hand.
 */
export const fillMissingTerms = async (now = new Date()): Promise<string[]> =>
  (await stampTerm(currentTerm(now), missingTerm)).map((exec) => exec.id);
