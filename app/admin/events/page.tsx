"use client";

import { Button } from "@/components/ui/button";
import EventModal from "./event-modal";
import { useEffect, useMemo, useState } from "react";
import { EventRecord, fetchAllEvents, WithKey, deleteEvent } from "@/lib/api";
import { classifyEventsByTiming } from "@/lib/events/classify";
import {
  getEventTiming,
  formatEventTimeLabel,
  formatNextOccurrenceDate,
} from "@/lib/events/schedule";
import { ConfirmationModal } from "@/components/ui/modal";
import { AdminTable, ColumnDef } from "@/components/ui/admin-table";

export default function EventsManagementPage() {
  type EventItem = WithKey<EventRecord>;

  const [showModal, setShowModal] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [openConfirmationModel, setOpenConfirmationModel] = useState(false);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [nowTimestamp] = useState(() => Date.now());

  const actionsColumn: ColumnDef<(typeof upcomingEvents)[0]> = {
    header: "Actions",
    headerClassName: "text-center",
    cellClassName: "flex justify-around gap-[15px]",
    cell: (event) => (
      <>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setSelectedEvent(event.rawEvent);
            setShowModal(true);
          }}
        >
          EDIT
        </Button>
        <Button
          variant="link"
          className="text-red-600"
          size="sm"
          onClick={() => {
            setSelectedEvent(event.rawEvent);
            setOpenConfirmationModel(true);
          }}
        >
          Delete
        </Button>
      </>
    ),
  };

  const standardColumns: ColumnDef<(typeof upcomingEvents)[0]>[] = [
    {
      header: "Event Title",
      accessorKey: "title",
      cellClassName: "max-w-[12rem] truncate",
    },
    { header: "Date", accessorKey: "date" },
    { header: "Time", accessorKey: "time" },
    {
      header: "Location",
      accessorKey: "location",
      cellClassName: "max-w-[10rem] truncate",
    },
    actionsColumn,
  ];

  const recurringColumns: ColumnDef<(typeof recurringEvents)[0]>[] = [
    {
      header: "Event Title",
      accessorKey: "title",
      cellClassName: "max-w-[12rem] truncate",
    },
    {
      header: "Recurrence",
      cell: (e) => e.rawEvent.schedule?.recurrence?.unit,
    },
    {
      header: "Next Occurrence",
      cell: (e) =>
        formatNextOccurrenceDate(
          getEventTiming(e.rawEvent, nowTimestamp).nextStartTimestamp,
        ),
    },
    {
      header: "Time",
      cell: (e) =>
        formatEventTimeLabel(
          e.rawEvent,
          getEventTiming(e.rawEvent, nowTimestamp).nextStartTimestamp,
        ),
    },
    {
      header: "Location",
      accessorKey: "location",
      cellClassName: "max-w-[10rem] truncate",
    },
    actionsColumn,
  ];

  const load = async (isActive: () => boolean = () => true) => {
    try {
      const allEvents = await fetchAllEvents();
      if (!isActive()) {
        return;
      }
      setEvents(allEvents);
    } catch {
      if (!isActive()) {
        return;
      }
      console.error("Error loading events:");
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
    } = classifyEventsByTiming(events, nowTimestamp);
    const merged = upcomingRaw.concat(ongoing);
    const recurring = merged.filter((event) => event.schedule?.recurrence);
    const upcoming = merged.filter((event) => !event.schedule?.recurrence);

    return { upcoming, recurring, past };
  }, [events, nowTimestamp]);

  const adaptEventForDisplay = (event: EventItem) => ({
    id: event.$key,
    title: event.title,
    date: event.schedule?.startDate,
    time: event.schedule?.startTime,
    location: event.location?.split(",")[0],
    description: event.description,
    image: event.image,
    rawEvent: event,
  });

  const upcomingEvents = upcoming.map((event) => adaptEventForDisplay(event));
  const recurringEvents = recurring.map((event) => adaptEventForDisplay(event));
  const pastEvents = past.map((event) => adaptEventForDisplay(event));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Events Management</h1>
      <p className="text-neutral-500 mb-6">
        Plan, coordinate, and review club events
      </p>

      <div className="flex items-center justify-between mb-6">
        <Button
          variant="primary"
          onClick={() => {
            setSelectedEvent(null);
            setShowModal(true);
          }}
        >
          + New Event
        </Button>
      </div>

      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">Upcoming Events</h2>
        <AdminTable
          columns={standardColumns}
          data={upcomingEvents}
          keyExtractor={(e) => e.id}
        />
      </div>

      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">Recurring Events</h2>
        <AdminTable
          columns={recurringColumns}
          data={recurringEvents}
          keyExtractor={(e) => e.id}
        />
      </div>

      <div className="mb-10 border-t-2 border-black pt-6">
        <button
          className="flex items-center gap-2 text-xl font-bold mb-4 hover:opacity-80 transition-opacity"
          onClick={() => setShowPastEvents(!showPastEvents)}
        >
          Past Events {showPastEvents ? "▲" : "▼"}
        </button>

        {showPastEvents && (
          <div className="mb-10">
            <h2 className="text-xl font-bold mb-4">Past Events</h2>
            <AdminTable
              columns={standardColumns}
              data={pastEvents}
              keyExtractor={(e) => e.id}
            />
          </div>
        )}
      </div>

      {openConfirmationModel && (
        <ConfirmationModal
          open={openConfirmationModel}
          title="Confirm Deletion"
          message="Are you sure you want to delete this event? This action cannot be undone."
          onConfirm={async () => {
            if (!selectedEvent?.$key) return;
            await deleteEvent(selectedEvent.$key);
            load();
          }}
          onClose={() => setOpenConfirmationModel(false)}
        />
      )}

      {showModal && (
        <EventModal
          showModal={showModal}
          setShowModal={setShowModal}
          variant={selectedEvent ? "edit" : "create"}
          selectedEvent={selectedEvent}
          onSave={() => void load()}
        />
      )}
    </div>
  );
}
