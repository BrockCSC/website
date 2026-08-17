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

const buildEventIcs = (
  event: WithKey<EventRecord>,
  startTimestamp: number,
  eventUrl: string,
): string => {
  const endTimestamp =
    startTimestamp + (getEventDurationMs(event) ?? DEFAULT_DURATION_MS);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BrockCSC//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.$key}@brockcsc.ca`,
    `DTSTAMP:${toIcsTimestamp(Date.now())}`,
    `DTSTART:${toIcsTimestamp(startTimestamp)}`,
    `DTEND:${toIcsTimestamp(endTimestamp)}`,
    `SUMMARY:${escapeIcsText(event.title ?? "BrockCSC Event")}`,
    ...(event.description
      ? [`DESCRIPTION:${escapeIcsText(event.description)}`]
      : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
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
  anchor.download = `${(event.title ?? "event").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};
