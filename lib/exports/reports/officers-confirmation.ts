import { CLUB_NAME } from "@/lib/brand";
import { grantsApproval } from "@/lib/execs/titles";
import { clubDay, longDate } from "../dates";
import {
  coPresidentSigners,
  peopleWarnings,
  teamTerm,
  termWarnings,
} from "../people";
import { MISSING_VALUE, plural } from "../text";
import type { ExportReport, ReportSigner } from "../types";

type OfficersConfirmationData = {
  term: string;
  officers: { name: string; title: string; term: string; hidden: boolean }[];
  untitled: { name: string; detail: string }[];
  signers: ReportSigner[];
  warnings: string[];
  hasCoPresident: boolean;
};

export const officersConfirmationReport: ExportReport<OfficersConfirmationData> =
  {
    id: "officers-confirmation",
    title: "Confirmation of Officers",
    description:
      "Who holds each executive position, confirmed by the co-presidents. No student numbers or contact details, so it can go to the bank or the student union.",
    confidential: false,
    params: [{ name: "date", label: "Dated", kind: "date" }],
    defaults: (now) => ({ date: clubDay(now) }),
    // The table is always today's officers, so an earlier date would certify a team the data doesn't cover.
    validate: (values, now) =>
      values.date < clubDay(now)
        ? "Dated can't be before today; the list shows the current officers."
        : null,
    load: async (ctx) => {
      const snapshot = await ctx.people();
      const current = snapshot.people.filter((person) => person.isCurrent);
      const term = teamTerm(current, ctx.now);
      return {
        term,
        officers: current.map(({ name, title, term, hidden }) => ({
          name,
          title,
          term,
          hidden,
        })),
        untitled: current
          .filter((person) => !person.title)
          .map((person) => ({
            name: person.name,
            detail: "no position on their tile",
          })),
        signers: coPresidentSigners(current),
        warnings: [
          ...peopleWarnings(snapshot, current),
          ...termWarnings(current, term, ctx.now),
        ],
        hasCoPresident: current.some((person) => grantsApproval(person.title)),
      };
    },
    preview: (data) => ({
      summary: `${data.officers.length} officer${plural(data.officers.length)} will be listed.`,
      warnings: [
        ...data.warnings,
        ...data.officers
          .filter((officer) => officer.hidden)
          .map(
            (officer) =>
              `${officer.name} hid their public team tile but is named in this document.`,
          ),
        ...(data.hasCoPresident
          ? []
          : [
              "No current exec has the Co-President title, so the signature names are blank.",
            ]),
      ],
      attention: data.untitled.length
        ? { label: "No position set", people: data.untitled }
        : undefined,
    }),
    render: (data, { params }) => ({
      kind: "letter",
      title: "Confirmation of Officers",
      subtitle: `${data.term} academic year`,
      blocks: [
        {
          kind: "paragraph",
          text: `This confirms that, as of ${longDate(params.date)}, the following individuals hold the listed positions with the ${CLUB_NAME}:`,
        },
        {
          kind: "table",
          columns: [
            { title: "Position", width: 170 },
            { title: "Name", width: 210 },
            { title: "Term", width: 120 },
          ],
          rows: data.officers.map((officer) => [
            officer.title || MISSING_VALUE,
            officer.name,
            officer.term || MISSING_VALUE,
          ]),
          empty: "No current executives are on record.",
        },
        { kind: "signatures", label: "Confirmed by", signers: data.signers },
      ],
    }),
  };
