"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";

import { fetchAllEvents, type EventRecord, type WithKey } from "@/lib/api";
import { classifyEventsByTiming } from "@/lib/events/classify";
import {
  formatEventDayBadge,
  formatEventTimeLabel,
  getEventStartTimestamp,
  getEventTiming,
} from "@/lib/events/schedule";
import { EventCard } from "@/components/ui/event-card";

type EventItem = WithKey<EventRecord>;

export function UpcomingEventsSection() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [nowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      try {
        const { upcoming } = classifyEventsByTiming(
          await fetchAllEvents(),
          nowTimestamp,
        );
        if (!active) return;

        setEvents(upcoming.slice(0, 2));
      } catch (e) {
        console.error("Failed to load events", e);
      } finally {
        if (active) setLoadingEvents(false);
      }
    };

    void loadEvents();
    return () => {
      active = false;
    };
  }, [nowTimestamp]);

  return (
    <section className="w-full border-b-2 border-line bg-raised">
      <div className="max-w-7xl mx-auto px-1 py-14 sm:px-8 sm:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="size-5 rounded-full border-2 border-brand bg-transparent" />
              <h2 className="text-3xl sm:text-4xl text-ink font-bold tracking-tight m-0">
                Upcoming Events
              </h2>
            </div>
            <p className="text-subtle font-medium max-w-lg">
              From game nights to workshops. High contrast events for high
              impact learning.
            </p>
          </div>

          <Link
            href="/events"
            className="text-brand font-bold flex items-center gap-2 hover:underline group shrink-0"
          >
            View Calendar{" "}
            <ArrowRight className="size-4 transition-transform duration-[var(--dur)] ease-smooth group-hover:translate-x-1" />
          </Link>
        </div>

        <div
          aria-busy={loadingEvents}
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {loadingEvents ? (
            <>
              <span className="sr-only">Loading events</span>
              {[0, 1].map((key) => (
                <div
                  key={key}
                  aria-hidden="true"
                  className="w-full animate-pulse rounded-[24px] border-2 border-line bg-surface p-2 shadow-[4px_4px_0_0_var(--brand)]"
                >
                  <div className="aspect-[4/3] w-full rounded-[16px] border-2 border-line bg-tint sm:aspect-video" />
                  <div className="flex flex-col gap-4 p-4 pt-5">
                    <div className="h-7 w-2/3 rounded-[6px] bg-tint" />
                    <div className="h-4 w-full rounded-[6px] bg-tint" />
                    <div className="h-4 w-5/6 rounded-[6px] bg-tint" />
                    <div className="mt-2 h-12 w-full rounded-[14px] bg-tint" />
                  </div>
                </div>
              ))}
            </>
          ) : events.length > 0 ? (
            events.map((event) => {
              const ts =
                getEventTiming(event, nowTimestamp).nextStartTimestamp ??
                getEventStartTimestamp(event);
              const dayLabel = formatEventDayBadge(event, ts);
              const timeLabel = formatEventTimeLabel(event, ts);

              const tags = [
                { label: dayLabel, icon: <CalendarDays strokeWidth={2.5} /> },
                { label: timeLabel, icon: <Clock3 strokeWidth={2.5} /> },
              ];

              if (event.location) {
                tags.push({
                  label: event.location,
                  icon: <MapPin strokeWidth={2.5} />,
                });
              }

              return (
                <Link
                  key={event.$key}
                  href={`/events/${event.$key}`}
                  className="animate-fade-in block h-full cursor-pointer"
                >
                  <EventCard
                    title={event.title ?? "Untitled Event"}
                    description={
                      event.description ?? "More details coming soon..."
                    }
                    tags={tags}
                    imageUrl={event.image?.url ?? null}
                  />
                </Link>
              );
            })
          ) : (
            <div className="animate-fade-in col-span-1 md:col-span-2 py-12 text-center text-subtle font-bold border-2 border-dashed border-line/40 rounded-2xl">
              No upcoming events at the moment. Check back soon!
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
