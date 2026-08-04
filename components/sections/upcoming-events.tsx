"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";

import { fetchFutureEvents, type EventRecord, type WithKey } from "@/lib/api";
import {
  formatEventDayBadge,
  formatEventTimeLabel,
  getEventStartTimestamp,
} from "@/lib/events/schedule";
import { EventCard } from "@/components/ui/event-card";

type EventItem = WithKey<EventRecord>;

export function UpcomingEventsSection() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      try {
        const futureEvents = await fetchFutureEvents();
        if (!active) return;

        // Sorted ascending by start time and takes the first two for now( could change this to display more but I think 2 is enough)
        const sorted = futureEvents.sort((a, b) => {
          return (
            (getEventStartTimestamp(a) || 0) - (getEventStartTimestamp(b) || 0)
          );
        });
        setEvents(sorted.slice(0, 2));
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
  }, []);

  return (
    <section className="w-full border-b-2 border-black bg-neutral-50/50">
      <div className="max-w-7xl mx-auto px-8 py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="size-5 rounded-full border-2 border-[#9A4440] bg-transparent" />
              <h2 className="text-4xl text-black font-bold tracking-tight m-0">
                Upcoming Events
              </h2>
            </div>
            <p className="text-neutral-500 font-medium max-w-lg">
              From game nights to workshops. High contrast events for high
              impact learning.
            </p>
          </div>

          <Link
            href="/events"
            className="text-[#9A4440] font-bold flex items-center gap-2 hover:underline group shrink-0"
          >
            View Calendar{" "}
            <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {loadingEvents ? (
            <div className="col-span-1 md:col-span-2 py-12 text-center text-neutral-500 font-bold">
              Loading events...
            </div>
          ) : events.length > 0 ? (
            events.map((event) => {
              const ts = getEventStartTimestamp(event);
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
                  className="block h-full cursor-pointer"
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
            <div className="col-span-1 md:col-span-2 py-12 text-center text-neutral-500 font-bold border-2 border-dashed border-neutral-300 rounded-2xl">
              No upcoming events at the moment. Check back soon!
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
