import { NextResponse, type NextRequest } from "next/server";

import type { EventRecord } from "@/lib/api/types";
import { findById, toWireRecord } from "@/lib/db/repository";
import { eventsTable } from "@/lib/db/schema";
import { buildEventIcs, eventIcsFilename } from "@/lib/events/ics";
import { getEventStartTimestamp, getEventTiming } from "@/lib/events/schedule";

// A real text/calendar response, linked directly on touch devices: iOS hands
// it to Calendar, where a blob download would land in Files (public-missed-1).
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const entity = await findById<EventRecord>(eventsTable, id).catch(() => null);
  if (!entity) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = toWireRecord(entity);

  // ?start= picks one occurrence of a recurring event (the page passes the
  // one it shows). Otherwise the next occurrence, else the first.
  const requested = Number(req.nextUrl.searchParams.get("start"));
  const start =
    Number.isFinite(requested) && requested > 0
      ? requested
      : (getEventTiming(event, Date.now()).nextStartTimestamp ??
        getEventStartTimestamp(event));
  if (start === null) {
    return NextResponse.json(
      { error: "This event has no date yet" },
      { status: 404 },
    );
  }

  const eventUrl = `${req.nextUrl.origin}/events/${encodeURIComponent(event.$key)}`;
  const filename = eventIcsFilename(event);
  return new NextResponse(buildEventIcs(event, start, eventUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
