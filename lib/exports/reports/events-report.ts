import type { EventRecord } from "@/lib/api/types";
import { findAll } from "@/lib/db/repository";
import { eventsTable } from "@/lib/db/schema";
import {
  formatEventTimeLabel,
  getEventStartTimestamp,
  getRecurrenceLabel,
} from "@/lib/events/schedule";
import { clubDay, isCalendarDay, longDate, rangeStartDay } from "../dates";
import { dateRangeError } from "../params";
import { MISSING_VALUE, plural } from "../text";
import type { ExportReport, ReportCell } from "../types";

type EventsReportData = {
  from: string;
  to: string;
  events: EventRecord[];
  undated: number;
  openEnded: number;
};

/** Only the fields the PDF prints, with an unusable endDate dropped. */
const selectEvents = (
  records: EventRecord[],
  from: string,
  to: string,
): Omit<EventsReportData, "from" | "to"> => {
  const events: EventRecord[] = [];
  let undated = 0;
  let openEnded = 0;

  for (const { title, presenter, location, dscEvent, schedule } of records) {
    const startDate = schedule?.startDate ?? "";
    if (!schedule || !isCalendarDay(startDate)) {
      undated += 1;
      continue;
    }
    const endDate =
      schedule.endDate && isCalendarDay(schedule.endDate)
        ? schedule.endDate
        : undefined;
    const event: EventRecord = {
      title,
      presenter,
      location,
      dscEvent,
      schedule: { ...schedule, endDate },
    };

    if (getRecurrenceLabel(event) !== null) {
      if (startDate > to || (endDate && endDate < from)) continue;
      if (!endDate && startDate < from) openEnded += 1;
    } else if (startDate < from || startDate > to) {
      continue;
    }
    events.push(event);
  }

  events.sort(
    (a, b) =>
      (a.schedule?.startDate ?? "").localeCompare(
        b.schedule?.startDate ?? "",
      ) ||
      (a.schedule?.startTime ?? "").localeCompare(b.schedule?.startTime ?? ""),
  );
  return { events, undated, openEnded };
};

const dateCell = (event: EventRecord): ReportCell => {
  const startDate = event.schedule?.startDate ?? "";
  const endDate = event.schedule?.endDate ?? "";
  const lastDay = endDate && endDate !== startDate ? endDate : "";
  const recurrence = getRecurrenceLabel(event);

  if (!recurrence) {
    return {
      lines: [
        longDate(startDate),
        ...(lastDay
          ? [[{ text: `to ${longDate(lastDay)}`, muted: true }]]
          : []),
      ],
    };
  }
  // The site stops showing a series after its endDate, so "until" matches what members saw.
  return {
    lines: [
      recurrence,
      [{ text: `from ${longDate(startDate)}`, muted: true }],
      ...(lastDay
        ? [[{ text: `until ${longDate(lastDay)}`, muted: true }]]
        : []),
    ],
  };
};

const timeCell = (event: EventRecord): ReportCell => {
  const start = getEventStartTimestamp(event);
  if (start === null) return MISSING_VALUE;
  // "6:00 PM - 7:30 PM" is wider than the column and would break inside "7:30 PM".
  const [startText, endText] = formatEventTimeLabel(event, start).split(" - ");
  return endText
    ? { lines: [startText, [{ text: `to ${endText}`, muted: true }]] }
    : startText;
};

const eventRow = (event: EventRecord): ReportCell[] => {
  const presenter = event.presenter?.trim();
  return [
    dateCell(event),
    timeCell(event),
    {
      lines: [
        [{ text: event.title?.trim() || "Untitled event", bold: true }],
        ...(presenter
          ? [[{ text: `Presented by ${presenter}`, muted: true }]]
          : []),
      ],
    },
    event.location?.trim() || MISSING_VALUE,
    event.dscEvent === true ? "DSC" : "Club",
  ];
};

export const eventsReport: ExportReport<EventsReportData> = {
  id: "events-report",
  title: "Events Report",
  description:
    "Everything the club ran between two dates, for the annual report or a student union activity report.",
  confidential: false,
  params: [
    { name: "from", label: "From", kind: "date" },
    { name: "to", label: "To", kind: "date" },
  ],
  defaults: (now) => ({ from: rangeStartDay(now), to: clubDay(now) }),
  validate: dateRangeError,
  load: async ({ params }) => ({
    from: params.from,
    to: params.to,
    ...selectEvents(
      await findAll<EventRecord>(eventsTable),
      params.from,
      params.to,
    ),
  }),
  preview: ({ from, to, events, undated, openEnded }) => ({
    summary: `${events.length} event${plural(events.length)} between ${longDate(from)} and ${longDate(to)}.`,
    warnings: [
      ...(undated > 0
        ? [
            `${undated} event${plural(undated)} with no start date ${undated === 1 ? "is" : "are"} left out.`,
          ]
        : []),
      ...(openEnded > 0
        ? [
            `${openEnded} recurring series started before ${longDate(from)} and ${openEnded === 1 ? "has" : "have"} no end date, so ${openEnded === 1 ? "it's" : "they're"} counted as still running.`,
          ]
        : []),
    ],
  }),
  render: ({ from, to, events }) => ({
    kind: "report",
    title: "Events Report",
    subtitle: `${longDate(from)} to ${longDate(to)}`,
    blocks: [
      {
        kind: "fields",
        items: [
          { label: "Events", value: String(events.length) },
          {
            label: "DSC events",
            value: String(
              events.filter((event) => event.dscEvent === true).length,
            ),
          },
          {
            label: "Recurring series",
            value: String(
              events.filter((event) => getRecurrenceLabel(event) !== null)
                .length,
            ),
          },
        ],
      },
      {
        kind: "table",
        columns: [
          { title: "Date", width: 130 },
          { title: "Time", width: 80 },
          { title: "Event", width: 160 },
          { title: "Location", width: 80 },
          { title: "Type", width: 50 },
        ],
        rows: events.map(eventRow),
        empty: "No events in this period.",
      },
      {
        kind: "note",
        text: "Recurring events are listed once, as a series. The site doesn't record attendance.",
      },
    ],
  }),
};
