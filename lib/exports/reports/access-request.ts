import { CLUB_NAME } from "@/lib/brand";
import { grantsApproval } from "@/lib/execs/titles";
import {
  accessGaps,
  accessHeaderBlocks,
  accessTable,
  splitAccessList,
} from "../access";
import { clubDay, longDate } from "../dates";
import {
  coPresidentSigners,
  coPresidentsAddress,
  peopleWarnings,
  teamTerm,
  termWarnings,
  type ExecPerson,
} from "../people";
import { plural } from "../text";
import type { ExportReport, ReportSigner } from "../types";

type AccessRequestData = ReturnType<typeof splitAccessList> & {
  term: string;
  requesters: ReportSigner[];
  /** Co-presidents left off the access list, whose signature names print blank. */
  unlisted: string[];
  warnings: string[];
  hasCoPresident: boolean;
};

export const accessRequestReport: ExportReport<AccessRequestData> = {
  id: "access-request",
  title: "Access Request",
  description:
    "Every current exec's name, student ID and access card ID on letterhead, for requesting building card access. Anyone missing a detail is left out.",
  confidential: true,
  params: [
    {
      name: "area",
      label: "Area or room(s)",
      kind: "text",
      maxLength: 120,
      placeholder: "Leave blank to write it in by hand",
    },
    { name: "until", label: "Access until", kind: "date", optional: true },
  ],
  validate: (values, now) =>
    values.until && values.until < clubDay(now)
      ? "Access until can't be before today."
      : null,
  load: async (ctx) => {
    const snapshot = await ctx.people();
    const current = snapshot.people.filter((person) => person.isCurrent);
    const listed = (person: ExecPerson) => accessGaps(person).length === 0;
    // Requests go in over the summer, so this follows the incoming team's tiles rather than the calendar.
    const term = teamTerm(current, ctx.now);
    return {
      ...splitAccessList(current),
      term,
      // Anyone left out of the list stays out of the whole letter, signature names included.
      requesters: coPresidentSigners(current, listed),
      unlisted: current
        .filter((person) => grantsApproval(person.title) && !listed(person))
        .map((person) => person.name),
      warnings: [
        ...peopleWarnings(snapshot, current),
        ...termWarnings(current, term, ctx.now),
      ],
      hasCoPresident: current.some((person) => grantsApproval(person.title)),
    };
  },
  preview: (data) => ({
    summary: data.rows.length
      ? `${data.rows.length} executive${plural(data.rows.length)} will be listed for ${data.term}.`
      : "No current executive has all three details on file yet.",
    warnings: [
      ...data.warnings,
      ...data.unlisted.map(
        (name) =>
          `${name} is left off the access list, so their signature name is blank.`,
      ),
      ...(data.hasCoPresident
        ? []
        : [
            "No current exec has the Co-President title, so the signature names are blank.",
          ]),
    ],
    attention: data.skipped.length
      ? {
          label: `${data.skipped.length} left out of the PDF`,
          people: data.skipped,
        }
      : undefined,
  }),
  render: (data, { now, params }) => {
    const count = data.rows.length;
    const until = params.until ? longDate(params.until) : "";
    return {
      kind: "letter",
      title: "Access Request",
      subtitle: `Card access for current executives, ${data.term}`,
      blocks: [
        ...accessHeaderBlocks(now, [
          { label: "Area or room(s)", value: params.area ?? "" },
          { label: "Access until", value: until },
        ]),
        { kind: "paragraph", text: "To whom it may concern," },
        {
          kind: "paragraph",
          text: `On behalf of the ${CLUB_NAME}, we request card access for the ${count} current executive${plural(count)} listed below for the ${data.term} academic year${until ? `, until ${until}` : ""}. Each person's Brock student number and access card ID are included so their cards can be matched to this request.`,
        },
        accessTable(
          data.rows,
          "No current executive has a name, student ID and access card ID on file.",
        ),
        {
          kind: "paragraph",
          text: `Please contact us at ${coPresidentsAddress()} with any questions about this request.`,
        },
        { kind: "signatures", label: "Requested by", signers: data.requesters },
      ],
    };
  },
};
