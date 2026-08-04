import type { EventRecord } from "@/lib/api/types";

type RecurrenceUnit = "day" | "week" | "month";

type NormalizedRecurrence = {
  interval: number;
  unit: RecurrenceUnit;
  byWeekday: number[] | null;
};

type ScheduleShape = NonNullable<EventRecord["schedule"]>;

const TORONTO_TIMEZONE = "America/Toronto";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const clampWeekday = (value: number): number | null =>
  Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;

const parseTime = (
  timeText: string,
): { hour: number; minute: number } | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
};

const parseDate = (
  dateText: string,
): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const getTimeZoneParts = (
  timestamp: number,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(timestamp));
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
  };
};

const toTorontoTimestamp = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number => {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let index = 0; index < 5; index += 1) {
    const actual = getTimeZoneParts(guess);
    const desiredAsUtcMinutes =
      Date.UTC(year, month - 1, day, hour, minute) / 60000;
    const actualAsUtcMinutes =
      Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
      ) / 60000;
    const diffMinutes = desiredAsUtcMinutes - actualAsUtcMinutes;
    if (diffMinutes === 0) {
      return guess;
    }
    guess += diffMinutes * 60000;
  }

  return guess;
};

const getNormalizedRecurrence = (
  schedule: ScheduleShape,
): NormalizedRecurrence | null => {
  const recurrence = schedule.recurrence;
  if (!recurrence) {
    return null;
  }

  const interval = recurrence.interval ?? 1;
  const unit = recurrence.unit;
  if (
    typeof interval !== "number" ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    !Number.isInteger(interval) ||
    (unit !== "day" && unit !== "week" && unit !== "month")
  ) {
    return null;
  }

  const weekdays = Array.isArray(recurrence.byWeekday)
    ? recurrence.byWeekday
        .map(clampWeekday)
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)
    : [];

  return {
    interval,
    unit,
    byWeekday: weekdays.length > 0 ? weekdays : null,
  };
};

const getBaseStartTimestamp = (schedule: ScheduleShape): number | null => {
  if (!schedule.startDate || !schedule.startTime) {
    return null;
  }

  const parsedDate = parseDate(schedule.startDate);
  const parsedTime = parseTime(schedule.startTime);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  return toTorontoTimestamp(
    parsedDate.year,
    parsedDate.month,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
  );
};

const getSessionDurationMs = (schedule: ScheduleShape): number | null => {
  if (!schedule.startTime) {
    return null;
  }

  const startTime = parseTime(schedule.startTime);
  const endTime = schedule.endTime ? parseTime(schedule.endTime) : null;
  if (!startTime || !endTime) {
    return null;
  }

  const startMinutes = startTime.hour * 60 + startTime.minute;
  const endMinutes = endTime.hour * 60 + endTime.minute;
  if (endMinutes <= startMinutes) {
    return null;
  }

  return (endMinutes - startMinutes) * 60 * 1000;
};

const addMonths = (timestamp: number, months: number): number => {
  const current = getTimeZoneParts(timestamp);
  const target = new Date(
    Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
    ),
  );
  target.setUTCMonth(target.getUTCMonth() + months);

  return toTorontoTimestamp(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    current.hour,
    current.minute,
  );
};

const getEndOfDayTimestamp = (
  year: number,
  month: number,
  day: number,
): number => toTorontoTimestamp(year, month, day, 23, 59) + 59_999;

const getTorontoWeekdayFromTimestamp = (timestamp: number): number => {
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIMEZONE,
    weekday: "short",
  }).format(new Date(timestamp));

  return WEEKDAY_SHORT_TO_INDEX[weekdayShort] ?? 0;
};

const getNextWeeklyStart = (
  baseStart: number,
  recurrence: NormalizedRecurrence,
  nowTimestamp: number,
): number => {
  const stepWeeks = recurrence.interval;
  const stepMs = stepWeeks * WEEK_MS;
  const desiredWeekdays = recurrence.byWeekday;

  if (!desiredWeekdays || desiredWeekdays.length === 0) {
    if (nowTimestamp <= baseStart) {
      return baseStart;
    }
    const cyclesElapsed = Math.ceil((nowTimestamp - baseStart) / stepMs);
    return baseStart + cyclesElapsed * stepMs;
  }

  const baseWeekday = getTorontoWeekdayFromTimestamp(baseStart);
  const cyclesStart =
    nowTimestamp <= baseStart
      ? 0
      : Math.floor((nowTimestamp - baseStart) / stepMs);
  const startCycle = Math.max(0, cyclesStart - 1);

  let candidate: number | null = null;

  for (let cycle = startCycle; cycle < startCycle + 8; cycle += 1) {
    const cycleBase = baseStart + cycle * stepMs;
    for (const weekday of desiredWeekdays) {
      const dayOffset = (weekday - baseWeekday + 7) % 7;
      const occurrence = cycleBase + dayOffset * DAY_MS;
      if (occurrence < baseStart || occurrence < nowTimestamp) {
        continue;
      }
      if (candidate === null || occurrence < candidate) {
        candidate = occurrence;
      }
    }
    if (candidate !== null) {
      break;
    }
  }

  return candidate ?? baseStart;
};

const isBeforeSeriesStart = (
  event: EventRecord,
  timestamp: number,
): boolean => {
  const schedule = event.schedule;
  if (!schedule?.startDate) {
    return false;
  }
  const parsed = parseDate(schedule.startDate);
  if (!parsed) {
    return false;
  }
  return (
    timestamp < toTorontoTimestamp(parsed.year, parsed.month, parsed.day, 0, 0)
  );
};

const isAfterSeriesEnd = (event: EventRecord, timestamp: number): boolean => {
  const schedule = event.schedule;
  if (!schedule?.endDate) {
    return false;
  }
  const parsed = parseDate(schedule.endDate);
  if (!parsed) {
    return false;
  }
  return (
    timestamp > getEndOfDayTimestamp(parsed.year, parsed.month, parsed.day)
  );
};

export const isRecurringEvent = (event: EventRecord): boolean => {
  if (!event.schedule) {
    return false;
  }
  return getNormalizedRecurrence(event.schedule) !== null;
};

export const getRecurrenceLabel = (event: EventRecord): string | null => {
  const schedule = event.schedule;
  if (!schedule) {
    return null;
  }
  const recurrence = getNormalizedRecurrence(schedule);
  if (!recurrence) {
    return null;
  }

  if (recurrence.unit === "week" && recurrence.interval === 1) {
    return "Recurring weekly";
  }
  if (recurrence.unit === "week" && recurrence.interval === 2) {
    return "Recurring biweekly";
  }
  if (recurrence.interval === 1) {
    return `Recurring ${recurrence.unit}ly`;
  }

  return `Recurring every ${recurrence.interval} ${recurrence.unit}s`;
};

export const getEventStartTimestamp = (event: EventRecord): number | null => {
  const schedule = event.schedule;
  if (!schedule) {
    return null;
  }
  return getBaseStartTimestamp(schedule);
};

export const getRecurringScheduleText = (event: EventRecord): string | null => {
  const schedule = event.schedule;
  if (!schedule) {
    return null;
  }

  const baseStart = getBaseStartTimestamp(schedule);
  if (baseStart === null) {
    return null;
  }

  const recurrence = getNormalizedRecurrence(schedule);
  if (!recurrence) {
    return null;
  }

  const parts = getTimeZoneParts(baseStart);
  const weekday = WEEKDAY_NAMES_LONG[getTorontoWeekdayFromTimestamp(baseStart)];
  const hour12 = ((parts.hour + 11) % 12) + 1;
  const amPm = parts.hour >= 12 ? "PM" : "AM";
  const minute = String(parts.minute).padStart(2, "0");
  const timeText = `${hour12}:${minute} ${amPm}`;

  if (recurrence.unit === "week") {
    if (recurrence.interval === 1) {
      return `Every ${weekday} at ${timeText}`;
    }
    if (recurrence.interval === 2) {
      return `Every other ${weekday} at ${timeText}`;
    }
    return `Every ${recurrence.interval} weeks on ${weekday} at ${timeText}`;
  }
  if (recurrence.unit === "day") {
    return recurrence.interval === 1
      ? `Every day at ${timeText}`
      : `Every ${recurrence.interval} days at ${timeText}`;
  }

  return recurrence.interval === 1
    ? `Monthly on day ${parts.day} at ${timeText}`
    : `Every ${recurrence.interval} months on day ${parts.day} at ${timeText}`;
};

export const getEventTiming = (
  event: EventRecord,
  nowTimestamp: number,
): {
  isRecurring: boolean;
  isOngoing: boolean;
  nextStartTimestamp: number | null;
} => {
  const schedule = event.schedule;
  if (!schedule) {
    return {
      isRecurring: false,
      isOngoing: false,
      nextStartTimestamp: null,
    };
  }

  const baseStart = getBaseStartTimestamp(schedule);
  if (baseStart === null) {
    return {
      isRecurring: false,
      isOngoing: false,
      nextStartTimestamp: null,
    };
  }

  const recurrence = getNormalizedRecurrence(schedule);
  const durationMs = getSessionDurationMs(schedule);
  const startsInFuture = nowTimestamp <= baseStart;

  if (!recurrence) {
    if (
      isBeforeSeriesStart(event, nowTimestamp) ||
      isAfterSeriesEnd(event, nowTimestamp)
    ) {
      return {
        isRecurring: false,
        isOngoing: false,
        nextStartTimestamp: isAfterSeriesEnd(event, nowTimestamp)
          ? null
          : baseStart,
      };
    }
    const isOngoing =
      durationMs !== null &&
      baseStart <= nowTimestamp &&
      nowTimestamp < baseStart + durationMs;

    return {
      isRecurring: false,
      isOngoing,
      nextStartTimestamp: startsInFuture
        ? baseStart
        : isOngoing
          ? baseStart
          : null,
    };
  }

  let nextStart: number | null = null;
  if (recurrence.unit === "week") {
    nextStart = getNextWeeklyStart(baseStart, recurrence, nowTimestamp);
  } else if (recurrence.unit === "day") {
    if (nowTimestamp <= baseStart) {
      nextStart = baseStart;
    } else {
      const stepMs = recurrence.interval * DAY_MS;
      const cycles = Math.ceil((nowTimestamp - baseStart) / stepMs);
      nextStart = baseStart + cycles * stepMs;
    }
  } else {
    if (nowTimestamp <= baseStart) {
      nextStart = baseStart;
    } else {
      let probe = baseStart;
      for (let i = 0; i < 240; i += 1) {
        if (probe >= nowTimestamp) {
          break;
        }
        probe = addMonths(probe, recurrence.interval);
      }
      nextStart = probe;
    }
  }

  if (nextStart !== null && isAfterSeriesEnd(event, nextStart)) {
    nextStart = null;
  }

  const previousStart =
    nextStart !== null
      ? recurrence.unit === "month"
        ? addMonths(nextStart, -recurrence.interval)
        : nextStart -
          (recurrence.unit === "day"
            ? recurrence.interval * DAY_MS
            : recurrence.interval * WEEK_MS)
      : null;

  const isOngoing =
    durationMs !== null &&
    previousStart !== null &&
    previousStart <= nowTimestamp &&
    nowTimestamp < previousStart + durationMs &&
    !isBeforeSeriesStart(event, previousStart) &&
    !isAfterSeriesEnd(event, previousStart);

  return {
    isRecurring: true,
    isOngoing,
    nextStartTimestamp: nextStart,
  };
};

export const formatEventDateLabel = (
  event: EventRecord,
  occurrenceStartTimestamp: number | null,
): string => {
  const recurringText = getRecurringScheduleText(event);
  if (recurringText) {
    return recurringText;
  }

  if (typeof occurrenceStartTimestamp !== "number") {
    return "Date TBD";
  }

  const parts = getTimeZoneParts(occurrenceStartTimestamp);
  const weekday =
    WEEKDAY_NAMES_LONG[
      getTorontoWeekdayFromTimestamp(occurrenceStartTimestamp)
    ];
  return `${weekday}, ${MONTH_NAMES_SHORT[parts.month - 1]} ${parts.day}, ${parts.year}`;
};

export const formatEventDayBadge = (
  event: EventRecord,
  occurrenceStartTimestamp: number | null,
): string => {
  if (typeof occurrenceStartTimestamp !== "number") {
    return "Date TBD";
  }

  const parts = getTimeZoneParts(occurrenceStartTimestamp);
  const weekday =
    WEEKDAY_NAMES_LONG[
      getTorontoWeekdayFromTimestamp(occurrenceStartTimestamp)
    ];
  if (isRecurringEvent(event)) {
    return weekday;
  }
  return `${weekday.slice(0, 3)}, ${MONTH_NAMES_SHORT[parts.month - 1]} ${parts.day}`;
};

export const formatEventTimeLabel = (
  event: EventRecord,
  occurrenceStartTimestamp: number | null,
): string => {
  const schedule = event.schedule;
  if (!schedule || typeof occurrenceStartTimestamp !== "number") {
    return "Time TBD";
  }

  const start = getTimeZoneParts(occurrenceStartTimestamp);
  const startHour = ((start.hour + 11) % 12) + 1;
  const startMinute = String(start.minute).padStart(2, "0");
  const startAmPm = start.hour >= 12 ? "PM" : "AM";
  const startText = `${startHour}:${startMinute} ${startAmPm}`;

  if (!schedule.endTime) {
    return startText;
  }

  const parsedEnd = parseTime(schedule.endTime);
  if (!parsedEnd) {
    return startText;
  }

  const endText = `${((parsedEnd.hour + 11) % 12) + 1}:${String(parsedEnd.minute).padStart(2, "0")} ${
    parsedEnd.hour >= 12 ? "PM" : "AM"
  }`;

  return `${startText} - ${endText}`;
};

export const formatNextOccurrenceDate = (
  occurrenceStartTimestamp: number | null,
): string => {
  if (typeof occurrenceStartTimestamp !== "number") {
    return "TBD";
  }

  const parts = getTimeZoneParts(occurrenceStartTimestamp);
  const weekday =
    WEEKDAY_NAMES_LONG[
      getTorontoWeekdayFromTimestamp(occurrenceStartTimestamp)
    ];

  return `${weekday}, ${MONTH_NAMES_SHORT[parts.month - 1]} ${parts.day}`;
};
