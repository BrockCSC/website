"use client";

import { ChevronRight, Plus } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
import { Fab } from "@/components/ui/fab";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { BELOW_LG, useMediaQuery } from "@/lib/use-media-query";
import { useStackParam } from "@/lib/use-stack-param";
import { ask } from "../ask";
import { AdminPage } from "../page-frame";
import { useSession } from "../session";
import { Note } from "../users/ui";
import EventEditor, { loadEventDraft } from "./event-modal";
import { btn, errorText } from "./ui";

type EventItem = WithKey<EventRecord>;
type Tab = "upcoming" | "recurring" | "past";

const BELOW_MD = "(max-width: 767.98px)";

const badge = (accent?: boolean) =>
  `inline-flex items-center rounded-full border-2 border-line px-2.5 py-0.5 text-xs font-bold ${
    accent ? "bg-brand text-brand-ink" : "bg-raised text-ink"
  }`;

function Poster({ event, sizes }: { event: EventItem; sizes: string }) {
  return event.image?.url ? (
    <Image
      alt=""
      className="object-cover"
      fill
      sizes={sizes}
      src={event.image.url}
      unoptimized
    />
  ) : (
    <span className="flex h-full items-center justify-center text-xl font-extrabold text-brand">
      {event.title?.trim().charAt(0).toUpperCase() ?? "?"}
    </span>
  );
}

function EventRow({
  event,
  isPast,
  now,
  onEdit,
  onDelete,
  compact,
}: {
  event: EventItem;
  isPast: boolean;
  now: number;
  /** Below md: the whole card opens the editor; Delete lives inside it. */
  compact: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const timing = getEventTiming(event, now);
  const start = isPast
    ? getEventStartTimestamp(event)
    : (timing.nextStartTimestamp ?? getEventStartTimestamp(event));
  const recurrence = getRecurrenceLabel(event);
  const when = recurrence
    ? `${isPast ? "From" : "Next"}: ${formatNextOccurrenceDate(start)}`
    : formatEventDateLabel(event, start);
  const time = formatEventTimeLabel(event, start);
  const location = event.location || "Location TBD";

  // One layout in the DOM at a time (not both, hidden by CSS), so text and
  // controls exist once.
  if (compact) {
    return (
      <li>
        <button
          className="press flex w-full items-center gap-3 rounded-[16px] border-2 border-line bg-surface p-3 text-left shadow-brut-sm"
          data-stack-return={event.$key}
          onClick={onEdit}
          type="button"
        >
          <span className="relative size-12 shrink-0 overflow-hidden rounded-[10px] border-2 border-line bg-tint">
            <Poster event={event} sizes="48px" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 leading-tight font-extrabold text-ink">
              {event.title || "Untitled event"}
            </span>
            <span className="truncate text-sm text-subtle">
              {timing.isOngoing && (
                <span className="font-bold text-ink">Live now · </span>
              )}
              {recurrence ? `${recurrence} · ` : ""}
              {when} · {time} · {location}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-4 rounded-[16px] border-2 border-line bg-surface p-3 shadow-brut-sm transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[3px_3px_0_0_var(--brand)] sm:p-4">
      <div className="relative min-h-16 w-16 shrink-0 self-stretch overflow-hidden rounded-[10px] border-2 border-line bg-tint">
        <Poster event={event} sizes="64px" />
      </div>

      <div className="min-w-[12rem] flex-1">
        <h3 className="text-lg leading-tight font-extrabold text-ink">
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
          <span className={badge()}>{when}</span>
          <span className={badge()}>{time}</span>
          <span className={`${badge()} max-w-[16rem] truncate`}>
            {location}
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

function SkeletonRows() {
  return (
    <div aria-busy="true" className="mt-6 flex flex-col gap-4" role="status">
      <span className="sr-only">Loading events…</span>
      {[0, 1, 2].map((row) => (
        <div
          aria-hidden
          className="flex animate-pulse items-center gap-3 rounded-[16px] border-2 border-line/30 p-3 md:h-[7.5rem]"
          key={row}
        >
          <span className="size-12 shrink-0 rounded-[10px] bg-line/10 md:h-full md:w-16" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-2/3 rounded bg-line/10" />
            <span className="h-3 w-5/6 rounded bg-line/10" />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function EventsManagementPage() {
  const { user } = useSession();
  const compact = useMediaQuery(BELOW_MD);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTimestamp] = useState(() => Date.now());
  // The next opening applies the stored draft (the "Reopen" toast).
  const [restore, setRestore] = useState(false);

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

  const reopen = (key: string) => {
    setRestore(true);
    ev.open(key);
  };

  // Back with unsaved changes (edge swipe, browser back, Android back) keeps
  // the draft and offers it again (spec D22). Never re-pushes.
  const keptToast = (key: string) =>
    toast({
      message: "Unsaved changes kept",
      action: { label: "Reopen", onAction: () => reopen(key) },
    });

  // `?event=new` or `?event=<key>`: pushed below lg, replaced at lg (D4).
  const ev = useStackParam("event", {
    push: BELOW_LG,
    onUserPop: (prev) => {
      if (loadEventDraft(prev)) keptToast(prev);
    },
  });

  const editing =
    ev.value && ev.value !== "new"
      ? (events?.find((event) => event.$key === ev.value) ?? null)
      : null;
  // A deep link waits for the list; an unknown key is dropped once it loads.
  const missing =
    ev.value != null && ev.value !== "new" && events != null && editing == null;
  const editorOpen = ev.value === "new" || editing != null;

  useEffect(() => {
    if (!missing) return;
    ev.close();
    toast({ message: "That event no longer exists.", tone: "error" });
  }, [missing, ev]);

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

  if (user && !user.isExecutive) {
    return (
      <AdminPage>
        <Note>Only a current executive can manage events.</Note>
      </AdminPage>
    );
  }

  const tabs = [
    { id: "upcoming" as const, label: "Upcoming", list: upcoming },
    { id: "recurring" as const, label: "Recurring", list: recurring },
    { id: "past" as const, label: "Past", list: past },
  ];
  const shown = tabs.find((t) => t.id === tab)!.list;

  const openNew = () => {
    setRestore(false);
    ev.open("new");
  };
  const openEvent = (event: EventItem) => {
    setRestore(false);
    ev.open(event.$key);
  };

  const confirmDelete = async (event: EventItem) => {
    const name = event.title || "this event";
    const ok = await ask({
      title: `Delete ${name}?`,
      detail:
        "It's removed from the website for good, along with its poster and sign-up link. This cannot be undone.",
      confirmLabel: "Delete event",
      destructive: true,
    });
    if (ok === null) return;
    try {
      await deleteEvent(event.$key);
      await load();
      toast({ message: `Deleted ${name}` });
    } catch {
      toast({
        message: "Couldn't delete that event. Try again.",
        tone: "error",
      });
    }
  };

  const empty = {
    upcoming: "Nothing on the calendar yet. Create the club's next event.",
    recurring: "No repeating events. Set a repeat on an event to see it here.",
    past: "No events have finished yet.",
  }[tab];

  return (
    <AdminPage>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-ink">Events</h1>
          <p className="mt-1.5 text-subtle">
            Plan, coordinate and review club events.
          </p>
        </div>
        <button
          className={`${btn.primary} phone:hidden`}
          onClick={openNew}
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

      <Segmented
        className="mt-6 md:hidden"
        label="Show"
        onChange={setTab}
        options={tabs.map(({ id, label, list }) => ({
          value: id,
          label,
          count: events ? list.length : undefined,
        }))}
        value={tab}
      />

      <div className="mt-7 flex flex-wrap gap-2 border-b-2 border-line pb-4 max-md:hidden">
        {tabs.map(({ id, label, list }) => (
          <button
            className={`rounded-[10px] border-2 border-line px-3.5 py-1.5 text-sm font-bold ${
              tab === id
                ? "bg-brand text-brand-ink shadow-brut-sm"
                : "bg-surface text-ink hover:-translate-y-0.5 hover:bg-tint hover:shadow-brut-sm motion-reduce:hover:translate-y-0"
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
        error ? null : (
          <SkeletonRows />
        )
      ) : shown.length === 0 ? (
        <div className="mt-6 animate-fade-in rounded-[20px] border-2 border-dashed border-line bg-raised px-6 py-12 text-center">
          <p className="font-bold text-ink">{empty}</p>
          {tab !== "past" && (
            <button
              className={`${btn.primary} mt-4 phone:hidden`}
              onClick={openNew}
              type="button"
            >
              + New event
            </button>
          )}
        </div>
      ) : (
        <ul
          className="mt-6 flex animate-fade-in flex-col gap-3 phone:pb-24 md:gap-4"
          key={tab}
        >
          {shown.map((event) => (
            <EventRow
              event={event}
              compact={compact}
              isPast={tab === "past"}
              key={event.$key}
              now={nowTimestamp}
              onDelete={() => void confirmDelete(event)}
              onEdit={() => openEvent(event)}
            />
          ))}
        </ul>
      )}

      <Fab extended icon={Plus} label="New event" onPress={openNew} />

      <EventEditor
        draftKey={ev.value ?? "new"}
        event={editing}
        onDeleted={(name) => {
          ev.close();
          void load();
          toast({ message: `Deleted ${name}` });
        }}
        onDiscard={() => ev.close()}
        onKeep={(kept) => {
          const key = ev.value;
          ev.close();
          if (kept && key) keptToast(key);
        }}
        onSaved={() => {
          ev.close();
          void load();
        }}
        open={editorOpen}
        restore={restore}
      />
    </AdminPage>
  );
}
