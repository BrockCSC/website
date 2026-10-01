import type { EventRecord, WithKey } from "@/lib/api/types";

import { getEventDurationMs } from "./schedule";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const toIcsTimestamp = (timestamp: number): string =>
  new Date(timestamp)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const escapeIcsText = (value: string): string =>
  value.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

const endFor = (event: WithKey<EventRecord>, startTimestamp: number) =>
  startTimestamp + (getEventDurationMs(event) ?? DEFAULT_DURATION_MS);

export const eventIcsFilename = (event: WithKey<EventRecord>): string =>
  `${
    (event.title ?? "event").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") ||
    "event"
  }.ics`;

export const buildEventIcs = (
  event: WithKey<EventRecord>,
  startTimestamp: number,
  eventUrl: string,
): string =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BrockCSC//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.$key}@brockcsc.ca`,
    `DTSTAMP:${toIcsTimestamp(Date.now())}`,
    `DTSTART:${toIcsTimestamp(startTimestamp)}`,
    `DTEND:${toIcsTimestamp(endFor(event, startTimestamp))}`,
    `SUMMARY:${escapeIcsText(event.title ?? "BrockCSC Event")}`,
    ...(event.description
      ? [`DESCRIPTION:${escapeIcsText(event.description)}`]
      : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

/** Same-origin .ics link (a text/calendar route): iOS opens it in Calendar. */
export const eventIcsHref = (
  event: WithKey<EventRecord>,
  startTimestamp: number,
): string =>
  `/api/events/${encodeURIComponent(event.$key)}/ics?start=${startTimestamp}`;

/** Google Calendar's "add event" template; Android opens it in the Calendar app. */
export const googleCalendarUrl = (
  event: WithKey<EventRecord>,
  startTimestamp: number,
  eventUrl: string,
): string => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title ?? "BrockCSC Event",
    dates: `${toIcsTimestamp(startTimestamp)}/${toIcsTimestamp(endFor(event, startTimestamp))}`,
  });
  if (event.location) params.set("location", event.location);
  params.set(
    "details",
    [event.description, eventUrl].filter(Boolean).join("\n\n"),
  );
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const downloadEventIcs = (
  event: WithKey<EventRecord>,
  startTimestamp: number,
): void => {
  const eventUrl = `${window.location.origin}/events/${event.$key}`;
  const blob = new Blob([buildEventIcs(event, startTimestamp, eventUrl)], {
    type: "text/calendar;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = eventIcsFilename(event);
  anchor.click();
  // Revoking in the same task can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};
