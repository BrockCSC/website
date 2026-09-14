import { CLUB_NAME } from "@/lib/brand";
import {
  ACCESS_CARD_ID_PATTERN,
  STUDENT_ID_PATTERN,
} from "@/lib/signups/validation";
import { clubDay, longDate } from "./dates";
import { coPresidentsAddress, type ExecPerson } from "./people";
import type { ReportBlock } from "./types";

type AccessRow = {
  firstName: string;
  lastName: string;
  studentId: string;
  accessCardId: string;
};

/** Why `person` can't be listed, in a fixed order; empty when they can. */
export const accessGaps = (person: ExecPerson): string[] => {
  const { account } = person;
  if (!account) return ["no approved account"];
  const gaps: string[] = [];
  if (!account.firstName || !account.lastName) {
    gaps.push("no first or last name");
  }
  if (!account.studentId) gaps.push("no student ID");
  else if (!STUDENT_ID_PATTERN.test(account.studentId)) {
    gaps.push("student ID isn't 6-10 digits");
  }
  if (!account.accessCardId) gaps.push("no access card ID");
  else if (!ACCESS_CARD_ID_PATTERN.test(account.accessCardId)) {
    gaps.push("access card ID isn't 5 digits");
  }
  return gaps;
};

const byName = (a: AccessRow, b: AccessRow) =>
  a.lastName.localeCompare(b.lastName, "en", { sensitivity: "base" }) ||
  a.firstName.localeCompare(b.firstName, "en", { sensitivity: "base" });

/** People with every detail as rows; everyone else with their reasons, never the values. */
export const splitAccessList = (people: ExecPerson[]) => {
  const rows: AccessRow[] = [];
  const skipped: { name: string; detail: string }[] = [];
  for (const person of people) {
    const gaps = accessGaps(person);
    if (gaps.length || !person.account) {
      skipped.push({ name: person.name, detail: gaps.join(", ") });
      continue;
    }
    const { firstName, lastName, studentId, accessCardId } = person.account;
    rows.push({ firstName, lastName, studentId, accessCardId });
  }
  return { rows: rows.sort(byName), skipped };
};

/** Date, From and Contact, each filled optional field, then a blank line for each one left empty. */
export const accessHeaderBlocks = (
  now: Date,
  optional: { label: string; value: string }[],
): ReportBlock[] => [
  {
    kind: "fields",
    items: [
      { label: "Date", value: longDate(clubDay(now)) },
      { label: "From", value: `Co-Presidents, ${CLUB_NAME}` },
      { label: "Contact", value: coPresidentsAddress() },
      ...optional.filter((field) => field.value),
    ],
  },
  ...optional
    .filter((field) => !field.value)
    .map((field): ReportBlock => ({ kind: "blank", label: field.label })),
];

export const accessTable = (rows: AccessRow[], empty: string): ReportBlock => ({
  kind: "table",
  columns: [
    { title: "#", width: 28, align: "right" },
    { title: "Name", width: 232 },
    { title: "Student ID", width: 120, nowrap: true },
    { title: "Access card ID", width: 120, nowrap: true },
  ],
  rows: rows.map((row, i) => [
    String(i + 1),
    `${row.lastName}, ${row.firstName}`,
    row.studentId,
    row.accessCardId,
  ]),
  empty,
});
