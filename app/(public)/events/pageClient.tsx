"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRevealedGroups } from "@/lib/use-revealed-groups";

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

const matchesQuery = (event: EventItem, query: string): boolean =>
  [event.title, event.description, event.presenter, event.location].some(
    (field) => field?.toLowerCase().includes(query),
  );

export default function EventsPageClient({
  initialQuery,
}: {
  initialQuery: string;
}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [query, setQuery] = useState(initialQuery);
  const [reloadCount, setReloadCount] = useState(0);
  const hasRestoredScrollRef = useRef(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const updateQuery = (value: string) => {
    setQuery(value);
    const trimmed = value.trim();
    window.history.replaceState(
      null,
      "",
      trimmed
        ? `${window.location.pathname}?q=${encodeURIComponent(trimmed)}`
        : window.location.pathname,
    );
  };

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
  }, [reloadCount]);

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

  const appliedQuery = useDeferredValue(query);
  const normalizedQuery = appliedQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const resultsClass = `transition-opacity duration-[var(--dur)] ease-smooth ${
    appliedQuery === query ? "opacity-100" : "opacity-60"
  }`;

  const { ongoing, upcoming, past } = useMemo(
    () =>
      classifyEventsByTiming(
        normalizedQuery
          ? events.filter((event) => matchesQuery(event, normalizedQuery))
          : events,
        nowTimestamp,
      ),
    [events, normalizedQuery, nowTimestamp],
  );
  const matchCount = ongoing.length + upcoming.length + past.length;

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
      items: events,
    }));
  }, [past]);

  const archive = useRevealedGroups(pastGroups, 10, isSearching);

  return (
    <main className="min-h-screen bg-surface pb-10">
      <section className="border-b border-line/25 pt-4 pb-4">
        <h1 className="m-0 font-semibold text-[clamp(2.1rem,3.5vw,2.9rem)] leading-[1.05]">
          Events
        </h1>
        <p className="section-lead mt-2 max-w-[580px] pl-3 text-[0.92rem]">
          Stay in the loop. From technical workshops to social mixers, see
          what&apos;s happening in the Brock CS community.
        </p>
      </section>

      {!loading && !error && events.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            />
            <input
              aria-label="Search events"
              className="w-full rounded-[10px] border-2 border-line bg-surface py-2 pr-3 pl-9 text-ink"
              onChange={(changeEvent) => updateQuery(changeEvent.target.value)}
              placeholder="Search by title, presenter or location"
              type="search"
              value={query}
            />
          </div>
          {isSearching && (
            <>
              <span aria-live="polite" className="text-sm text-subtle">
                {matchCount} of {events.length} events
              </span>
              <Button
                onClick={() => updateQuery("")}
                size="sm"
                variant="outline"
              >
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      <div className={resultsClass}>
        {isSearching && matchCount === 0 && (
          <section className="animate-fade-in mt-3 rounded-[16px] border-2 border-dashed border-line/25 bg-surface px-4 py-8 text-center">
            <h2 className="m-0 font-semibold text-[1.35rem] leading-[1.1]">
              No events match &ldquo;{appliedQuery.trim()}&rdquo;
            </h2>
            <p className="mx-auto mt-2 mb-4 max-w-[38rem] text-[0.9rem] text-subtle">
              Try a shorter search, or browse everything we&apos;ve hosted.
            </p>
            <Button onClick={() => updateQuery("")} variant="primary">
              Clear search
            </Button>
          </section>
        )}

        {ongoing.length > 0 && (
          <section className="animate-fade-in mt-3 rounded-[16px] bg-linear-to-b from-brand/10 to-brand/5 px-3 py-3.5 sm:px-4">
            <h2 className="m-0 font-semibold text-[1.55rem] leading-[1.1]">
              Ongoing Events
            </h2>
            <p className="mt-0 mb-2.5 text-[0.86rem] font-semibold text-subtle">
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

        {!loading &&
          !error &&
          !isSearching &&
          ongoing.length === 0 &&
          upcoming.length === 0 && (
            <section className="mt-3 rounded-[16px] border-2 border-dashed border-line/25 bg-surface px-4 py-8 text-center">
              <h2 className="m-0 font-semibold text-[1.35rem] leading-[1.1]">
                Nothing on the calendar right now
              </h2>
              <p className="mx-auto mt-2 mb-4 max-w-[38rem] text-[0.9rem] text-subtle">
                We run workshops, socials and talks through the school year.
                Join the Discord and you&apos;ll hear about the next one first.
              </p>
              <a
                className="inline-flex items-center gap-2 rounded-[16px] border-2 border-line bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-brut-sm"
                href="https://discord.gg/dsxEASYgRd"
                rel="noreferrer"
                target="_blank"
              >
                Join the Discord
              </a>
            </section>
          )}

        {upcoming.length > 0 && (
          <section className="animate-fade-in mt-3 rounded-[16px] bg-surface px-0 py-4 sm:px-4">
            <h2 className="m-0 font-semibold text-[1.75rem] leading-[1.1]">
              Upcoming Events
            </h2>
            <p className="mt-[-0.1rem] mb-3 text-[0.9rem] font-semibold text-subtle">
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

        <section
          className={`mt-3 rounded-[16px] bg-surface px-0 py-4 sm:px-4 ${
            isSearching && pastGroups.length === 0 ? "hidden" : ""
          }`}
        >
          <h2 className="m-0 mb-3 font-semibold text-[1.75rem] leading-[1.1]">
            Past Events
          </h2>
          <p className="mt-[-0.1rem] mb-3 text-[0.9rem] font-semibold text-subtle">
            What we&apos;ve hosted.
          </p>

          {error && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="m-0 text-subtle">{error}</p>
              <Button
                onClick={() => setReloadCount((count) => count + 1)}
                size="sm"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          )}
          {loading && (
            <div
              aria-label="Loading past events"
              aria-busy="true"
              className="mb-4 grid grid-cols-3 gap-3 max-[980px]:grid-cols-2 max-[700px]:grid-cols-1"
              role="status"
            >
              {[0, 1, 2].map((index) => (
                <div
                  aria-hidden="true"
                  className="h-64 animate-pulse rounded-2xl border border-line/25 bg-raised"
                  key={index}
                />
              ))}
            </div>
          )}
          {!loading && !error && pastGroups.length === 0 && (
            <p className="mb-4 text-subtle">No past events found.</p>
          )}

          <div className="flex flex-col gap-4">
            {archive.visible.map((group) => (
              <section className="animate-rise-in" key={group.term}>
                <h3 className="mb-2 text-base font-semibold text-ink/80">
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

            {archive.hasMore && (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Button onClick={archive.revealMore} variant="outline">
                  Show earlier events
                </Button>
                <Button onClick={archive.revealAll} size="sm" variant="ghost">
                  Show all {archive.hidden}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
