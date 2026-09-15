import { STUDENT_ID_PATTERN } from "@/lib/signups/validation";
import { clubDay, longDate } from "../dates";
import {
  clubAddress,
  peopleWarnings,
  teamTerm,
  termWarnings,
  type ExecPerson,
} from "../people";
import { MISSING_VALUE, plural } from "../text";
import type { ExportReport, ReportCell } from "../types";

type ExecutiveRosterData = {
  term: string;
  current: ExecPerson[];
  warnings: string[];
};

const missingDetails = (person: ExecPerson): string[] => {
  const { account } = person;
  if (!account) return ["no approved account"];
  const gaps: string[] = [];
  if (!account.studentId) gaps.push("no student ID");
  else if (!STUDENT_ID_PATTERN.test(account.studentId)) {
    gaps.push("student ID isn't 6-10 digits");
  }
  if (!account.email) gaps.push("no email");
  return gaps;
};

const rosterRow = ({ title, name, account }: ExecPerson): ReportCell[] => [
  title || MISSING_VALUE,
  {
    lines: [name, ...(account ? [] : [[{ text: "No account", muted: true }]])],
  },
  account?.studentId || MISSING_VALUE,
  account
    ? {
        lines: [
          account.email || MISSING_VALUE,
          ...(account.username
            ? [[{ text: clubAddress(account.username), muted: true }]]
            : []),
        ],
      }
    : MISSING_VALUE,
];

export const executiveRosterReport: ExportReport<ExecutiveRosterData> = {
  id: "executive-roster",
  title: "Executive Roster",
  description:
    "Current execs with position, student ID and Brock email, for club registration with the student union and for handover.",
  confidential: true,
  params: [],
  load: async (ctx) => {
    const snapshot = await ctx.people();
    const current = snapshot.people.filter((person) => person.isCurrent);
    const term = teamTerm(current, ctx.now);
    return {
      term,
      current,
      warnings: [
        ...peopleWarnings(snapshot, current),
        ...termWarnings(current, term, ctx.now),
      ],
    };
  },
  preview: (data) => {
    const count = data.current.length;
    const people = data.current.flatMap((person) => {
      const gaps = missingDetails(person);
      return gaps.length
        ? [{ name: person.name, detail: gaps.join(", ") }]
        : [];
    });
    return {
      summary: `${count} current executive${plural(count)}.`,
      warnings: data.warnings,
      attention: people.length
        ? { label: "Missing details", people }
        : undefined,
    };
  },
  render: (data, { now }) => ({
    kind: "report",
    title: "Executive Roster",
    subtitle: `${data.term} academic year, as of ${longDate(clubDay(now))}`,
    blocks: [
      {
        kind: "table",
        // One wide nowrap Contact column, so a long email shrinks instead of breaking mid-address.
        columns: [
          { title: "Position", width: 95 },
          { title: "Name", width: 135 },
          { title: "Student ID", width: 80, nowrap: true },
          { title: "Contact", width: 190, nowrap: true },
        ],
        rows: data.current.map(rosterRow),
        empty: "No current executives are on record.",
      },
      {
        kind: "note",
        text: "A dash is a detail the exec hasn't added to their profile. Grey addresses are club mailboxes. Keep this document private: it lists student numbers.",
      },
    ],
  }),
};
