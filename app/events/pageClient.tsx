"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAllEvents, type EventRecord, type WithKey } from "@/lib/api";
import { classifyEventsByTiming } from "@/lib/events/classify";
import { getEventStartTimestamp } from "@/lib/events/schedule";

import { EventTimelineCard } from "./components/event-timeline-card";

type EventItem = WithKey<EventRecord>;

const getPastTermLabel = (event: EventItem): string => {
  const timestamp = getEventStartTimestamp(event);
  if (typeof timestamp !== "number") {
    return "Unknown Term";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(map.get("year"));
  const month = Number(map.get("month"));

  if (month >= 9 && month <= 12) {
    return `Fall ${year}`;
  }
  if (month >= 1 && month <= 4) {
    return `Winter ${year}`;
  }
  return `Spring/Summer ${year}`;
};

export default function EventsPageClient() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const hasRestoredScrollRef = useRef(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const allEvents = await fetchAllEvents();
        if (!active) {
          return;
        }
        setEvents(allEvents);
      } catch {
        if (!active) {
          return;
        }
        setError("Could not load events right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading || hasRestoredScrollRef.current) {
      return;
    }

    hasRestoredScrollRef.current = true;
    const raw = window.sessionStorage.getItem("events:scrollY");
    if (!raw) {
      return;
    }

    const scrollY = Number(raw);
    window.sessionStorage.removeItem("events:scrollY");
    if (!Number.isFinite(scrollY)) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
    });
  }, [loading]);

  const { ongoing, upcoming, past } = useMemo(
    () => classifyEventsByTiming(events, nowTimestamp),
    [events, nowTimestamp],
  );

  const pastGroups = useMemo(() => {
    const groups = new Map<string, EventItem[]>();

    for (const event of past) {
      const term = getPastTermLabel(event);
      const existing = groups.get(term);
      if (existing) {
        existing.push(event);
      } else {
        groups.set(term, [event]);
      }
    }

    return Array.from(groups.entries()).map(([term, events]) => ({
      term,
      events,
    }));
  }, [past]);

  return (
    <main className="min-h-screen bg-white pb-10">
      <section className="border-b border-border pt-4 pb-4">
        <h1 className="m-0 font-semibold text-[clamp(2.1rem,3.5vw,2.9rem)] leading-[1.05]">
          Events
        </h1>
        <p className="section-lead mt-2 max-w-[580px] pl-3 text-[0.92rem]">
          Stay in the loop. From technical workshops to social mixers, see
          what&apos;s happening in the Brock CS community.
        </p>
      </section>

      {ongoing.length > 0 && (
        <section className="mt-3 rounded-[16px] bg-linear-to-b from-primary/10 to-primary/5 px-4 py-3.5">
          <h2 className="m-0 font-semibold text-[1.55rem] leading-[1.1]">
            Ongoing Events
          </h2>
          <p className="mt-0 mb-2.5 text-[0.86rem] font-semibold text-muted-foreground">
            Happening right now.
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            {ongoing.map((event) => (
              <EventTimelineCard
                event={event}
                key={event.$key}
                variant="ongoing"
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-3 rounded-[16px] bg-white px-4 py-4">
          <h2 className="m-0 font-semibold text-[1.75rem] leading-[1.1]">
            Upcoming Events
          </h2>
          <p className="mt-[-0.1rem] mb-3 text-[0.9rem] font-semibold text-muted-foreground">
            What&apos;s coming next.
          </p>

          <div className="grid grid-cols-1 gap-3">
            {upcoming.map((event) => (
              <EventTimelineCard
                event={event}
                key={event.$key}
                nowTimestamp={nowTimestamp}
                variant="upcoming"
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-3 rounded-[16px] bg-white px-4 py-4">
        <h2 className="m-0 mb-3 font-semibold text-[1.75rem] leading-[1.1]">
          Past Events
        </h2>
        <p className="mt-[-0.1rem] mb-3 text-[0.9rem] font-semibold text-muted-foreground">
          What we&apos;ve hosted.
        </p>

        {error && <p className="mb-4 text-muted-foreground">{error}</p>}
        {loading && (
          <p className="mb-4 text-muted-foreground">Loading past events...</p>
        )}
        {!loading && !error && pastGroups.length === 0 && (
          <p className="mb-4 text-muted-foreground">No past events found.</p>
        )}

        <div className="flex flex-col gap-4">
          {pastGroups.map((group) => (
            <section key={group.term}>
              <h3 className="mb-2 text-base font-semibold text-foreground/80">
                {group.term}
              </h3>
              <div className="grid grid-cols-3 gap-3 max-[980px]:grid-cols-2 max-[700px]:grid-cols-1">
                {group.events.map((event) => (
                  <EventTimelineCard
                    event={event}
                    key={event.$key}
                    variant="past"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
