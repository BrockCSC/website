import type { EventRecord, WithKey } from "@/lib/api/types";

import { getEventStartTimestamp, getEventTiming } from "./schedule";

type EventItem = WithKey<EventRecord>;

export type EventTimingGroups = {
  ongoing: EventItem[];
  upcoming: EventItem[];
  past: EventItem[];
};

export const classifyEventsByTiming = (
  events: EventItem[],
  nowTimestamp: number,
): EventTimingGroups => {
  const ongoing: EventItem[] = [];
  const upcoming: EventItem[] = [];
  const past: EventItem[] = [];
  const nextStartMap = new Map<string, number>();

  for (const event of events) {
    const timing = getEventTiming(event, nowTimestamp);
    if (typeof timing.nextStartTimestamp === "number") {
      nextStartMap.set(event.$key, timing.nextStartTimestamp);
    }

    if (timing.isOngoing) {
      ongoing.push(event);
      continue;
    }

    if (timing.isRecurring) {
      if (typeof timing.nextStartTimestamp === "number") {
        upcoming.push(event);
      } else {
        past.push(event);
      }
      continue;
    }

    const startTimestamp = getEventStartTimestamp(event);
    if (typeof startTimestamp !== "number" || startTimestamp >= nowTimestamp) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }

  upcoming.sort((left, right) => {
    const leftStart = nextStartMap.get(left.$key) ?? Number.MAX_SAFE_INTEGER;
    const rightStart = nextStartMap.get(right.$key) ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  });

  past.sort((left, right) => {
    const leftStart = getEventStartTimestamp(left) ?? Number.MIN_SAFE_INTEGER;
    const rightStart = getEventStartTimestamp(right) ?? Number.MIN_SAFE_INTEGER;
    return rightStart - leftStart;
  });

  return {
    ongoing,
    upcoming,
    past,
  };
};
