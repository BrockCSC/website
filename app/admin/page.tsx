"use client";

import { Button } from "@/components/ui/button";
import Card from "@/components/ui/card";
import { EventTimelineCard } from "../events/components/event-timeline-card";
import { EventRecord, fetchFutureEvents, WithKey } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AdminPage() {
  type EventItem = WithKey<EventRecord>;

  const [futureEvents, setFutureEvents] = useState<EventItem[]>([]);
  const [nowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const futureEventsRaw = await fetchFutureEvents();
        if (!active) {
          return;
        }
        setFutureEvents(futureEventsRaw);
      } catch {
        if (!active) {
          return;
        }
        console.error("Error loading events:");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const adaptEventForDisplay = (event: EventItem) => ({
    title: event.title,
    date: event.schedule?.startDate,
    time: event.schedule?.startTime,
    location: event.location?.split(",")[0],
    description: event.description,
    image: event.image,
  });

  const events = futureEvents.map(adaptEventForDisplay);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-neutral-500 mb-6">Welcome back!</p>

        <div className="grid grid-cols-1 md:grid-cols-2 mb-8 gap-6">
          <Card>
            <div className="flex flex-col items-start w-full">
              <span className="text-xs font-semibold text-neutral-500 mb-2">
                WEBSITE VISITS
              </span>
              <span className="text-2xl font-bold mb-1">2.4k</span>
              <span className="text-green-600 text-sm font-medium">
                ↑ +12% this month
              </span>
            </div>
          </Card>
          <div className="flex flex-col gap-4 mb-10 h-full justify-center">
            <Button asChild variant="primary" className="w-full md:w-auto">
              <Link href="/admin/events">+ Create New Event</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full md:w-auto">
              <Link href="/admin/execs">+ Add New Executive</Link>
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold mb-2">Upcoming Events</h1>
        <p className="text-neutral-500 mb-6">Click to edit an event</p>
        {events.length === 0 ? (
          <div className="text-center text-neutral-500 py-20">
            No upcoming events found.
          </div>
        ) : (
          <div className="grid gap-6">
            {futureEvents.map((event) => (
              <EventTimelineCard
                event={event}
                key={event.$key}
                nowTimestamp={nowTimestamp}
                variant="upcoming"
                displayButton={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
