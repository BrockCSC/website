import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { findAll, toWireRecord } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import {
  sortExecsByRoleThenDatabaseOrder,
  termStartYear,
} from "@/lib/execs/order";
import { currentTerm, servingTerm, storedTerms } from "@/lib/execs/terms";
import { grantsApproval } from "@/lib/execs/titles";
import { plural } from "./text";
import type { ReportSigner } from "./types";

/** Every string trimmed; "" when blank or missing. */
type ExecAccount = {
  signupId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  studentId: string;
  accessCardId: string;
  isFormerExec: boolean;
};

export type ExecPerson = {
  execId: string;
  /** Trimmed tile title, "" when unset. */
  title: string;
  /** Every term served, newest first. */
  terms: string[];
  /** Newest of `terms`, "" when none. */
  term: string;
  tileName: string;
  isCurrent: boolean;
  /** unset = the tile's isCurrentExec was never written. */
  currentFlag: "set" | "unset";
  hidden: boolean;
  account: ExecAccount | null;
  /** Account legal name ("First Last"), else tile name, else username, else "Unnamed". */
  name: string;
};

export type PeopleSnapshot = {
  people: ExecPerson[];
  /** Approved accounts on a tile that a newer approved account also links to. Their details are never used. */
  shadowed: { execId: string; name: string }[];
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const legalName = (signup: SignupRecord) =>
  [clean(signup.firstName), clean(signup.lastName)].filter(Boolean).join(" ");

const loadExecPeople = async (): Promise<PeopleSnapshot> => {
  const [execs, signups] = await Promise.all([
    findAll<ExecRecord>(execsTable),
    findAll<SignupRecord>(signupsTable),
  ]);

  // Last approved signup wins, the same as buildPeople in app/admin/users/api.ts.
  const accounts = new Map<string, (typeof signups)[number]>();
  const shadowed: PeopleSnapshot["shadowed"] = [];
  for (const signup of signups) {
    if (signup.status !== "approved" || !signup.execKey) continue;
    const earlier = accounts.get(signup.execKey);
    if (earlier) {
      shadowed.push({
        execId: signup.execKey,
        name: legalName(earlier) || clean(earlier.username) || "Unnamed",
      });
    }
    accounts.set(signup.execKey, signup);
  }

  return {
    people: sortExecsByRoleThenDatabaseOrder(execs.map(toWireRecord)).map(
      (tile) => {
        const signup = accounts.get(tile.$key);
        const account: ExecAccount | null = signup
          ? {
              signupId: signup.id,
              firstName: clean(signup.firstName),
              lastName: clean(signup.lastName),
              username: clean(signup.username),
              email: clean(signup.email),
              studentId: clean(signup.studentId),
              accessCardId: clean(signup.accessCardId),
              isFormerExec: signup.isFormerExec === true,
            }
          : null;
        const terms = storedTerms(tile);
        return {
          execId: tile.$key,
          title: clean(tile.title),
          terms,
          term: terms[0] ?? "",
          tileName: clean(tile.name),
          // The Users page's Current scope; currentFlag lets reports warn about tiles never marked either way.
          isCurrent: tile.isCurrentExec !== false,
          currentFlag:
            typeof tile.isCurrentExec === "boolean" ? "set" : "unset",
          hidden: tile.hidden === true,
          account,
          name:
            (signup && legalName(signup)) ||
            clean(tile.name) ||
            account?.username ||
            "Unnamed",
        };
      },
    ),
    shadowed,
  };
};

/** A memoised loader for one request. */
export const peopleLoader = () => {
  let loading: Promise<PeopleSnapshot> | undefined;
  return () => (loading ??= loadExecPeople());
};

const hasEnded = (term: string, now: Date) =>
  termStartYear(term) < termStartYear(currentTerm(now));

/** Most common term on the current tiles that hasn't ended (ties go to the newest), else the term today falls in. */
export const teamTerm = (current: ExecPerson[], now: Date): string => {
  // Only each person's newest term counts, so a returning exec votes once. From April to August the outgoing and incoming years both still count.
  const counts = new Map<string, number>();
  for (const { term } of current) {
    if (term && !hasEnded(term, now)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  const [best] = [...counts].sort(
    ([a, aCount], [b, bCount]) =>
      bCount - aCount || termStartYear(b) - termStartYear(a),
  );
  return best?.[0] ?? currentTerm(now);
};

/** Page-only warnings when current tiles list an ended term, or `term` isn't the academic year today falls in. */
export const termWarnings = (
  current: ExecPerson[],
  term: string,
  now: Date,
): string[] => {
  const today = currentTerm(now);
  const ended = current.filter(
    (person) => person.term && hasEnded(person.term, now),
  ).length;
  return [
    ...(ended
      ? [
          `${ended} current tile${plural(ended)} ${ended === 1 ? "has" : "have"} only terms that already ended; this document uses ${term}.`,
        ]
      : []),
    // From April the incoming tiles carry next year and teamTerm() follows them, which is what
    // the summer documents want; only a term that is neither of those two is worth flagging.
    ...(term === today || term === servingTerm(now)
      ? []
      : [
          `This document is for ${term}, not the current academic year (${today}).`,
        ]),
  ];
};

/** Page-only warnings about the people in `list`. */
export const peopleWarnings = (
  snapshot: PeopleSnapshot,
  list: ExecPerson[],
): string[] => {
  const byExec = new Map(list.map((person) => [person.execId, person]));
  return [
    ...list
      .filter((person) => person.isCurrent && person.account?.isFormerExec)
      .map(
        (person) =>
          `${person.name} is on a current tile but signed up as a former exec.`,
      ),
    ...list
      .filter((person) => person.currentFlag === "unset")
      .map(
        (person) =>
          `${person.name}'s tile isn't marked current or past, so it's treated as current.`,
      ),
    ...snapshot.shadowed.flatMap(({ execId, name }) => {
      const person = byExec.get(execId);
      return person
        ? [
            `${name} shares a tile with ${person.name}, so only ${person.name}'s details are used.`,
          ]
        : [];
    }),
  ];
};

const mailDomain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

export const clubAddress = (username: string) =>
  username ? `${username}@${mailDomain()}` : "";

// Built here rather than imported from lib/mail/provision.ts, which pulls in the Stalwart and OCI clients.
export const coPresidentsAddress = () =>
  `${process.env.CO_PRESIDENTS_LIST ?? "co-presidents"}@${mailDomain()}`;

/** The current co-presidents as signers, or two blank Co-President signers when there are none. */
export const coPresidentSigners = (current: ExecPerson[]): ReportSigner[] => {
  const signers = current
    .filter((person) => grantsApproval(person.title))
    .map((person): ReportSigner => ({
      name: person.name,
      title: "Co-President",
    }));
  return signers.length
    ? signers
    : [{ title: "Co-President" }, { title: "Co-President" }];
};
