import { SIGNING_TIME_ZONE } from "@/lib/documents/fields";

const zoned = (date: Date, options: Intl.DateTimeFormatOptions) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SIGNING_TIME_ZONE,
    ...options,
  }).formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
};

/** "2026-09-14": the club's calendar day. */
export const clubDay = (date: Date): string => {
  const part = zoned(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const dayParts = (day: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? match.slice(1).map(Number) : null;
};

/** A real YYYY-MM-DD date. */
export const isCalendarDay = (value: string): boolean => {
  const parts = dayParts(value);
  if (!parts) return false;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** The days a date param accepts: 2010 through the end of next year. */
export const dateBounds = (now: Date) => ({
  min: "2010-01-01",
  max: `${Number(clubDay(now).slice(0, 4)) + 1}-12-31`,
});

/** "September 14, 2026" for a YYYY-MM-DD day; "" when it isn't one. */
export const longDate = (day: string): string => {
  if (!isCalendarDay(day)) return "";
  const [year, month, date] = dayParts(day)!;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
};

/** "Sep 14, 2026" in the club's time zone; "" when missing or unparseable. */
export const shortDate = (iso: string | undefined): string => {
  const date = new Date(iso ?? "");
  if (!iso || Number.isNaN(date.getTime())) return "";
  const part = zoned(date, { year: "numeric", month: "short", day: "numeric" });
  return `${part("month")} ${part("day")}, ${part("year")}`;
};

/** "September 14, 2026 at 3:05 PM" in the club's time zone. */
export const generatedStamp = (date: Date): string => {
  const part = zoned(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${part("month")} ${part("day")}, ${part("year")} at ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
};

/** "2026-2027" for a YYYY-MM-DD day; terms start September 1. currentTerm() in lib/execs/terms.ts applies it to today. */
export const termForDay = (day: string): string => {
  const [year, month] = dayParts(day) ?? [0, 0];
  const start = month >= 9 ? year : year - 1;
  return `${start}-${start + 1}`;
};

/**
 * First day of the term containing the day 60 days before `now`, so an
 * export made in early September covers the year that just ended rather
 * than its first two weeks.
 */
export const rangeStartDay = (now: Date): string => {
  const lookback = clubDay(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
  return `${termForDay(lookback).slice(0, 4)}-09-01`;
};
