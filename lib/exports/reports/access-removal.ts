import { CLUB_NAME } from "@/lib/brand";
import { termStartYear } from "@/lib/execs/order";
import { grantsApproval } from "@/lib/execs/titles";
import {
  accessGaps,
  accessHeaderBlocks,
  accessTable,
  splitAccessList,
} from "../access";
import {
  coPresidentSigners,
  coPresidentsAddress,
  peopleWarnings,
} from "../people";
import { plural } from "../text";
import type { ExportReport, ReportSigner } from "../types";

type AccessRemovalData = ReturnType<typeof splitAccessList> & {
  term: string;
  /** Past execs with every detail on file but no term on their tile. */
  untermed: number;
  requesters: ReportSigner[];
  warnings: string[];
  hasCoPresident: boolean;
};

/** Nothing clears a student ID or card when an exec steps down, so their building access outlives the role until someone asks. */
export const accessRemovalReport: ExportReport<AccessRemovalData> = {
  id: "access-removal",
  title: "Access Removal",
  description:
    "Former execs from a chosen term whose student ID and access card ID are on file, for asking the university to remove their card access. Anyone missing a detail is left out.",
  confidential: true,
  params: [
    {
      name: "term",
      label: "Term served",
      kind: "term",
      placeholder: "Most recent past term",
    },
    {
      name: "area",
      label: "Area or room(s)",
      kind: "text",
      maxLength: 120,
      placeholder: "Leave blank to write it in by hand",
    },
  ],
  load: async (ctx) => {
    const snapshot = await ctx.people();
    const past = snapshot.people.filter((person) => !person.isCurrent);
    const current = snapshot.people.filter((person) => person.isCurrent);
    const term =
      ctx.params.term ||
      past
        .map((person) => person.term)
        .filter(Boolean)
        .sort((a, b) => termStartYear(b) - termStartYear(a))[0] ||
      "";
    const listed = term ? past.filter((person) => person.term === term) : [];
    return {
      ...splitAccessList(listed),
      term,
      untermed: past.filter(
        (person) => !person.term && accessGaps(person).length === 0,
      ).length,
      requesters: coPresidentSigners(current),
      warnings: peopleWarnings(snapshot, listed),
      hasCoPresident: current.some((person) => grantsApproval(person.title)),
    };
  },
  preview: (data) => {
    const count = data.rows.length;
    return {
      summary: !data.term
        ? "No past executive tile has a term recorded."
        : count
          ? `${count} former executive${plural(count)} from ${data.term} will be listed.`
          : `No former executive from ${data.term} has all three details on file.`,
      warnings: [
        ...data.warnings,
        ...(data.untermed
          ? [
              `${data.untermed} former exec${plural(data.untermed)} with card details on file ${data.untermed === 1 ? "has" : "have"} no term on their tile, so they can't be picked here.`,
            ]
          : []),
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
    };
  },
  render: (data, { now, params }) => {
    const count = data.rows.length;
    return {
      kind: "letter",
      title: "Access Removal",
      subtitle: data.term
        ? `Card access to remove for former executives, ${data.term}`
        : "Card access to remove for former executives",
      blocks: [
        ...accessHeaderBlocks(now, [
          { label: "Area or room(s)", value: params.area ?? "" },
        ]),
        { kind: "paragraph", text: "To whom it may concern," },
        {
          kind: "paragraph",
          text: `On behalf of the ${CLUB_NAME}, please remove card access for the ${count} former executive${plural(count)} listed below, who served on the executive team${data.term ? ` in ${data.term}` : ""} and ${count === 1 ? "is no longer an executive" : "are no longer executives"}.`,
        },
        accessTable(
          data.rows,
          "No former executive from this term has a name, student ID and access card ID on file.",
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
