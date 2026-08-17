"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventRecord, fetchAllEvents, WithKey, deleteEvent } from "@/lib/api";
import { classifyEventsByTiming } from "@/lib/events/classify";
import {
  formatEventDateLabel,
  formatEventTimeLabel,
  formatNextOccurrenceDate,
  getEventStartTimestamp,
  getEventTiming,
  getRecurrenceLabel,
} from "@/lib/events/schedule";
import { useHandoff } from "../palette";
import EventModal from "./event-modal";
import { Sheet, btn, errorText } from "./ui";

type EventItem = WithKey<EventRecord>;
type Tab = "upcoming" | "recurring" | "past";

const badge = (accent?: boolean) =>
  `inline-flex items-center rounded-full border-2 border-line px-2.5 py-0.5 text-xs font-bold ${
    accent ? "bg-brand text-brand-ink" : "bg-raised text-ink"
  }`;

function EventRow({
  event,
  isPast,
  now,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  isPast: boolean;
  now: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const timing = getEventTiming(event, now);
  const start = isPast
    ? getEventStartTimestamp(event)
    : (timing.nextStartTimestamp ?? getEventStartTimestamp(event));
  const recurrence = getRecurrenceLabel(event);

  return (
    <li className="flex flex-wrap items-start gap-4 rounded-[20px] border-2 border-line bg-surface p-4 shadow-brut-sm sm:p-5">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-[10px] border-2 border-line bg-tint">
        {event.image?.url ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="64px"
            src={event.image.url}
            unoptimized
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xl font-extrabold text-brand">
            {event.title?.trim().charAt(0).toUpperCase() ?? "?"}
          </span>
        )}
      </div>

      <div className="min-w-[12rem] flex-1">
        <h3 className="text-lg font-extrabold leading-tight text-ink">
          {event.title || "Untitled event"}
        </h3>
        {event.presenter && (
          <p className="text-sm font-semibold text-subtle">
            with {event.presenter}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {timing.isOngoing && <span className={badge(true)}>Live now</span>}
          {recurrence && <span className={badge()}>{recurrence}</span>}
          <span className={badge()}>
            {recurrence
              ? `${isPast ? "From" : "Next"}: ${formatNextOccurrenceDate(start)}`
              : formatEventDateLabel(event, start)}
          </span>
          <span className={badge()}>{formatEventTimeLabel(event, start)}</span>
          <span className={`${badge()} max-w-[16rem] truncate`}>
            {event.location || "Location TBD"}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className={btn.secondary} onClick={onEdit} type="button">
          Edit
        </button>
        <button className={btn.quiet} onClick={onDelete} type="button">
          Delete
        </button>
      </div>
    </li>
  );
}

export default function EventsManagementPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState<EventItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTimestamp] = useState(() => Date.now());

  const load = async (isActive: () => boolean = () => true) => {
    try {
      const allEvents = await fetchAllEvents();
      if (!isActive()) return;
      setEvents(allEvents);
      setError(null);
    } catch {
      if (!isActive()) return;
      setError("Couldn't load events. Try again in a moment.");
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      await load(() => active);
    })();
    return () => {
      active = false;
    };
  }, []);

  const { upcoming, recurring, past } = useMemo(() => {
    const {
      ongoing,
      upcoming: upcomingRaw,
      past,
    } = classifyEventsByTiming(events ?? [], nowTimestamp);
    const merged = ongoing.concat(upcomingRaw);
    return {
      upcoming: merged.filter((event) => !event.schedule?.recurrence),
      recurring: merged.filter((event) => event.schedule?.recurrence),
      past,
    };
  }, [events, nowTimestamp]);

  const tabs = [
    { id: "upcoming" as const, label: "Upcoming", list: upcoming },
    { id: "recurring" as const, label: "Recurring", list: recurring },
    { id: "past" as const, label: "Past", list: past },
  ];
  const shown = tabs.find((t) => t.id === tab)!.list;

  const openModal = useCallback((event: EventItem | null) => {
    setSelectedEvent(event);
    setShowModal(true);
  }, []);

  const openNew = useCallback(() => openModal(null), [openModal]);
  useHandoff("newEvent", openNew);
  useHandoff("event", openModal);

  const empty = {
    upcoming: "Nothing on the calendar yet. Create the club's next event.",
    recurring: "No repeating events. Set a repeat on an event to see it here.",
    past: "No events have finished yet.",
  }[tab];

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-ink">Events</h1>
          <p className="mt-1.5 text-subtle">
            Plan, coordinate and review club events.
          </p>
        </div>
        <button
          className={btn.primary}
          onClick={() => openModal(null)}
          type="button"
        >
          + New event
        </button>
      </div>

      {error && (
        <div className="mt-6 flex animate-rise-in flex-wrap items-center gap-3 rounded-[10px] border-2 border-destructive px-4 py-3">
          <p className={`${errorText} mt-0`}>{error}</p>
          <button
            className={`${btn.secondary} ml-auto`}
            onClick={() => void load()}
            type="button"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-2 border-b-2 border-line pb-4">
        {tabs.map(({ id, label, list }) => (
          <button
            className={`rounded-[10px] border-2 border-line px-3.5 py-1.5 text-sm font-bold ${
              tab === id
                ? "bg-brand text-brand-ink shadow-brut-sm"
                : "bg-surface text-ink hover:bg-tint"
            }`}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label} <span className="opacity-70">{list.length}</span>
          </button>
        ))}
      </div>

      {events === null ? (
        <p className="mt-8 font-bold text-subtle">Loading events...</p>
      ) : shown.length === 0 ? (
        <div className="mt-6 animate-fade-in rounded-[20px] border-2 border-dashed border-line bg-raised px-6 py-12 text-center">
          <p className="font-bold text-ink">{empty}</p>
          {tab !== "past" && (
            <button
              className={`${btn.primary} mt-4`}
              onClick={() => openModal(null)}
              type="button"
            >
              + New event
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-6 flex animate-fade-in flex-col gap-4" key={tab}>
          {shown.map((event) => (
            <EventRow
              event={event}
              isPast={tab === "past"}
              key={event.$key}
              now={nowTimestamp}
              onDelete={() => setDeleting(event)}
              onEdit={() => openModal(event)}
            />
          ))}
        </ul>
      )}

      {deleting && (
        <Sheet onClose={() => setDeleting(null)} title="Delete event">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <p className="text-ink">
              <strong className="font-extrabold">
                {deleting.title || "This event"}
              </strong>{" "}
              will be removed from the website for good, along with its poster
              and sign-up link. This cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 border-t-2 border-line px-5 py-4">
            <button
              className={btn.secondary}
              disabled={isDeleting}
              onClick={() => setDeleting(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={btn.danger}
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await deleteEvent(deleting.$key);
                  await load();
                  setDeleting(null);
                } catch {
                  setError("Couldn't delete that event. Try again.");
                  setDeleting(null);
                } finally {
                  setIsDeleting(false);
                }
              }}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Delete event"}
            </button>
          </div>
        </Sheet>
      )}

      {showModal && (
        <EventModal
          key={selectedEvent?.$key ?? "new"}
          onSave={() => void load()}
          selectedEvent={selectedEvent}
          setShowModal={setShowModal}
          showModal={showModal}
          variant={selectedEvent ? "edit" : "create"}
        />
      )}
    </div>
  );
}
