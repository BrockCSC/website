export type TemplateRun = { text: string; bold?: boolean };
export type TemplateLine = TemplateRun[];

type TemplateBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: TemplateLine[] }
  | { kind: "list"; ordered: boolean; items: TemplateLine[] };

/**
 * A fixed, developer-maintained set — not a database table. Each is a
 * downloadable branded letterhead, not editable content: `body` describes
 * placeholder headings, paragraphs and lists that lib/documents/template-files.ts
 * renders into a .docx or .pdf on request. A person fills in the blanks with
 * their own software and uploads the result back through the normal upload
 * flow, same as any other document.
 */
export type DocumentTemplate = {
  id: string;
  name: string;
  blurb: string;
  body: TemplateBlock[];
};

type RunLike = string | TemplateRun;
const toRun = (run: RunLike): TemplateRun =>
  typeof run === "string" ? { text: run } : run;

/** Bold run, for a labeled field like `B("Date:")` followed by a plain " [date]". */
const B = (text: string): TemplateRun => ({ text, bold: true });

/** Each argument is one line; more than one argument makes a multi-line paragraph. */
const P = (...lines: (RunLike | RunLike[])[]): TemplateBlock => ({
  kind: "paragraph",
  lines: lines.map((line) =>
    Array.isArray(line) ? line.map(toRun) : [toRun(line)],
  ),
});

const H = (text: string): TemplateBlock => ({ kind: "heading", text });

const UL = (...items: string[]): TemplateBlock => ({
  kind: "list",
  ordered: false,
  items: items.map((item) => [{ text: item }]),
});

const OL = (...items: string[]): TemplateBlock => ({
  kind: "list",
  ordered: true,
  items: items.map((item) => [{ text: item }]),
});

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "blank-letterhead",
    name: "Blank letterhead",
    blurb: "General branded stationery for any correspondence.",
    body: [
      P("[Recipient name and address]"),
      P("Dear [Recipient],"),
      P("[Body text.]"),
      P("Sincerely,"),
      P("[Name]", "[Title]"),
    ],
  },
  {
    id: "association-agreement",
    name: "Association agreement",
    blurb: "An agreement between the club and another party.",
    body: [
      H("Association Agreement"),
      P(
        "This agreement is made between the Brock University Computer Science Club (“BrockCSC”) and [other party], effective [date].",
      ),
      H("1. Purpose"),
      P("[Describe the purpose of the association.]"),
      H("2. Terms"),
      P("[List the terms both parties agree to.]"),
      P("Signed:"),
    ],
  },
  {
    id: "meeting-minutes",
    name: "Meeting minutes",
    blurb: "A record of what was discussed and decided at a meeting.",
    body: [
      H("Meeting Minutes"),
      P([B("Date:"), " [date]"], [B("Location:"), " [location]"]),
      P([B("Attendees:"), " [names]"]),
      H("Agenda"),
      OL("[Item]"),
      H("Discussion and decisions"),
      UL("[Point discussed, and what was decided.]"),
      P([B("Next meeting:"), " [date]"]),
    ],
  },
  {
    id: "bylaws-amendment",
    name: "Bylaws amendment",
    blurb: "A proposed or adopted change to the club bylaws.",
    body: [
      H("Bylaws Amendment"),
      P(
        "The following amendment to the BrockCSC bylaws was [proposed/adopted] on [date].",
      ),
      H("Current text"),
      P("[Quote the section being changed.]"),
      H("Amended text"),
      P("[Quote the replacement section.]"),
      P([B("Rationale:"), " [why this change is being made.]"]),
    ],
  },
  {
    id: "banking-resolution",
    name: "Banking resolution",
    blurb: "Authorizes signing authorities on the club's bank account.",
    body: [
      H("Banking Resolution"),
      P(
        "RESOLVED that the Brock University Computer Science Club authorizes the following individuals as signing authorities on its bank account(s), effective [date]:",
      ),
      UL("[Name], [Title]", "[Name], [Title]"),
      P(
        "This resolution replaces any prior banking resolution on file until further notice.",
      ),
    ],
  },
  {
    id: "confirmation-of-directors",
    name: "Confirmation of directors or officers",
    blurb: "Confirms who currently holds each executive position.",
    body: [
      H("Confirmation of Directors or Officers"),
      P(
        "This confirms that, as of [date], the following individuals hold the listed positions with the Brock University Computer Science Club:",
      ),
      UL("[Name] — [Title]"),
      P("Confirmed by:"),
    ],
  },
];

export const findDocumentTemplate = (id: string): DocumentTemplate | null =>
  DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? null;
