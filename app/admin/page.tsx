"use client";

import { Button } from "@/components/ui/button";
import { EventTimelineCard } from "../events/components/event-timeline-card";
import {
  DashboardStats,
  EventRecord,
  fetchDashboardStats,
  fetchFutureEvents,
  WithKey,
} from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

type EventItem = WithKey<EventRecord>;
type Tone = "muted" | "up" | "down";

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-neutral-500",
  up: "text-green-600",
  down: "text-[#d44b4b]",
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const viewsDetail = (
  pageViews: DashboardStats["pageViews"],
): { detail: string; tone: Tone } => {
  const { last30Days, previous30Days } = pageViews;
  if (previous30Days === 0) {
    return { detail: "No previous 30 days to compare", tone: "muted" };
  }
  const change = Math.round(
    ((last30Days - previous30Days) / previous30Days) * 100,
  );
  if (change === 0) {
    return { detail: "Level with the previous 30 days", tone: "muted" };
  }
  return {
    detail: `${change > 0 ? "↑ +" : "↓ "}${change}% vs previous 30 days`,
    tone: change > 0 ? "up" : "down",
  };
};

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  href?: string;
};

const StatCard = ({ label, value, detail, tone, href }: StatCardProps) => {
  const card = (
    <div className="h-full rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_#9A4440]">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="my-1 text-3xl font-bold text-[#9A4440]">{value}</div>
      <div className={`text-sm ${TONE_CLASS[tone]}`}>{detail}</div>
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="block transition-transform hover:-translate-y-0.5"
    >
      {card}
    </Link>
  ) : (
    card
  );
};

export default function AdminPage() {
  const [futureEvents, setFutureEvents] = useState<EventItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [nowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [events, dashboardStats] = await Promise.all([
          fetchFutureEvents(),
          fetchDashboardStats(),
        ]);
        if (!active) {
          return;
        }
        setFutureEvents(events);
        setStats(dashboardStats);
      } catch {
        if (!active) {
          return;
        }
        console.error("Error loading dashboard");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const views = stats ? viewsDetail(stats.pageViews) : null;
  const cards: StatCardProps[] = [
    {
      label: "Page views (30 days)",
      value: stats ? stats.pageViews.last30Days.toLocaleString() : "—",
      detail: views?.detail ?? "Loading",
      tone: views?.tone ?? "muted",
    },
    {
      label: "Executive team",
      value: stats ? String(stats.execs.current) : "—",
      detail: stats ? plural(stats.execs.past, "past member") : "Loading",
      tone: "muted",
    },
    {
      label: "Scheduled events",
      value: stats ? String(stats.events.upcoming) : "—",
      detail: stats ? plural(stats.events.past, "past event") : "Loading",
      tone: "muted",
      href: "/admin/events",
    },
    ...(stats && stats.pendingSignups !== null
      ? [
          {
            label: "Pending sign-ups",
            value: String(stats.pendingSignups),
            detail:
              stats.pendingSignups > 0
                ? "Waiting on your review"
                : "Nothing to review",
            tone: (stats.pendingSignups > 0 ? "down" : "muted") as Tone,
            href: "/admin/execs",
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-neutral-500 mb-6">Welcome back!</p>

        <div
          className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${
            cards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <Button asChild variant="primary">
            <Link href="/admin/events">+ Create New Event</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin/execs">+ Add New Executive</Link>
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold mb-2">Upcoming Events</h1>
        <p className="text-neutral-500 mb-6">Click to edit an event</p>
        {futureEvents.length === 0 ? (
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
