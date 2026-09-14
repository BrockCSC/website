import { DOCUMENT_CATEGORY_SUGGESTIONS } from "./categories";

/**
 * A fixed, developer-maintained set — not a database table. Each is a
 * starting point for editable content, not a static file: `bodyHtml` is the
 * placeholder body an exec edits in the rich text editor before it's rendered
 * into a full letterhead page (see lib/documents/letterhead.ts) and stored.
 */
export type DocumentTemplate = {
  id: string;
  name: string;
  blurb: string;
  defaultCategory: string;
  bodyHtml: string;
};

const p = (text: string) => `<p>${text}</p>`;

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "blank-letterhead",
    name: "Blank letterhead",
    blurb: "General branded stationery for any correspondence.",
    defaultCategory: "General Correspondence",
    bodyHtml: [
      p("[Recipient name and address]"),
      p("Dear [Recipient],"),
      p("[Body text.]"),
      p("Sincerely,"),
      p("[Name]<br>[Title]"),
    ].join(""),
  },
  {
    id: "association-agreement",
    name: "Association agreement",
    blurb: "An agreement between the club and another party.",
    defaultCategory: DOCUMENT_CATEGORY_SUGGESTIONS[0],
    bodyHtml: [
      "<h2>Association Agreement</h2>",
      p(
        "This agreement is made between the Brock University Computer Science Club (“BrockCSC”) and [other party], effective [date].",
      ),
      "<h2>1. Purpose</h2>",
      p("[Describe the purpose of the association.]"),
      "<h2>2. Terms</h2>",
      p("[List the terms both parties agree to.]"),
      p("Signed:"),
    ].join(""),
  },
  {
    id: "meeting-minutes",
    name: "Meeting minutes",
    blurb: "A record of what was discussed and decided at a meeting.",
    defaultCategory: DOCUMENT_CATEGORY_SUGGESTIONS[0],
    bodyHtml: [
      "<h2>Meeting Minutes</h2>",
      p(
        "<strong>Date:</strong> [date]<br><strong>Location:</strong> [location]",
      ),
      p("<strong>Attendees:</strong> [names]"),
      "<h2>Agenda</h2>",
      "<ol><li>[Item]</li></ol>",
      "<h2>Discussion and decisions</h2>",
      "<ul><li>[Point discussed, and what was decided.]</li></ul>",
      p("<strong>Next meeting:</strong> [date]"),
    ].join(""),
  },
  {
    id: "bylaws-amendment",
    name: "Bylaws amendment",
    blurb: "A proposed or adopted change to the club bylaws.",
    defaultCategory: DOCUMENT_CATEGORY_SUGGESTIONS[1],
    bodyHtml: [
      "<h2>Bylaws Amendment</h2>",
      p(
        "The following amendment to the BrockCSC bylaws was [proposed/adopted] on [date].",
      ),
      "<h2>Current text</h2>",
      p("[Quote the section being changed.]"),
      "<h2>Amended text</h2>",
      p("[Quote the replacement section.]"),
      p("<strong>Rationale:</strong> [why this change is being made.]"),
    ].join(""),
  },
  {
    id: "banking-resolution",
    name: "Banking resolution",
    blurb: "Authorizes signing authorities on the club's bank account.",
    defaultCategory: DOCUMENT_CATEGORY_SUGGESTIONS[1],
    bodyHtml: [
      "<h2>Banking Resolution</h2>",
      p(
        "RESOLVED that the Brock University Computer Science Club authorizes the following individuals as signing authorities on its bank account(s), effective [date]:",
      ),
      "<ul><li>[Name], [Title]</li><li>[Name], [Title]</li></ul>",
      p(
        "This resolution replaces any prior banking resolution on file until further notice.",
      ),
    ].join(""),
  },
  {
    id: "confirmation-of-directors",
    name: "Confirmation of directors or officers",
    blurb: "Confirms who currently holds each executive position.",
    defaultCategory: DOCUMENT_CATEGORY_SUGGESTIONS[2],
    bodyHtml: [
      "<h2>Confirmation of Directors or Officers</h2>",
      p(
        "This confirms that, as of [date], the following individuals hold the listed positions with the Brock University Computer Science Club:",
      ),
      "<ul><li>[Name] — [Title]</li></ul>",
      p("Confirmed by:"),
    ].join(""),
  },
];

export const findDocumentTemplate = (id: string): DocumentTemplate | null =>
  DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? null;
