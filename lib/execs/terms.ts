import type { ExecRecord } from "@/lib/api/types";
import { clubDay, termForDay } from "@/lib/exports/dates";
import { termStartYear } from "./order";

const FIRST_TERM_YEAR = 2010;
/** April: the outgoing team is on its way out, so anyone added now is serving the year that starts in September. */
const HANDOVER_MONTH = 4;

type TermFields = Pick<ExecRecord, "term" | "terms">;

/** "2026-2027": the academic year the club's calendar day falls in. */
export const currentTerm = (now = new Date()): string =>
  termForDay(clubDay(now));

/** The term auto-assignment writes: the current one until April, the incoming one after it. */
export const servingTerm = (now = new Date()): string => {
  const [year, month] = clubDay(now).split("-").map(Number);
  const start = month >= HANDOVER_MONTH ? year : year - 1;
  return `${start}-${start + 1}`;
};

/** Academic years, newest first, from next year back. The list a picker offers is the only valid set. */
export const academicTerms = (now = new Date()): string[] => {
  const latestStart = termStartYear(currentTerm(now));
  const terms: string[] = [];
  for (let year = latestStart + 1; year >= FIRST_TERM_YEAR; year--) {
    terms.push(`${year}-${year + 1}`);
  }
  return terms;
};

export const isValidTerm = (term: string, now = new Date()): boolean =>
  !term || academicTerms(now).includes(term);

export const byNewestTerm = (a: string, b: string): number =>
  termStartYear(b) - termStartYear(a) || b.localeCompare(a);

/** Trimmed, blanks and repeats dropped, newest first. */
export const sortTerms = (terms: string[]): string[] =>
  [...new Set(terms.map((term) => term.trim()).filter(Boolean))].sort(
    byNewestTerm,
  );

/** Both stored fields for a list: `term` mirrors the newest for everything still reading it. */
export const termFields = (
  terms: string[],
): { terms: string[]; term: string } => {
  const sorted = sortTerms(terms);
  return { terms: sorted, term: sorted[0] ?? "" };
};

/** Terms on file, newest first. Tiles written before `terms` existed only have `term`, so both count. */
export const storedTerms = ({ term, terms }: TermFields): string[] =>
  sortTerms(
    [...(Array.isArray(terms) ? terms : []), term].filter(
      (value): value is string => typeof value === "string",
    ),
  );

export const latestTerm = (exec: TermFields): string =>
  storedTerms(exec)[0] ?? "";
