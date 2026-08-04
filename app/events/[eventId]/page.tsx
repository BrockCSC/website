import type { Metadata } from "next";

import { findById } from "@/lib/db/repository";
import { eventsTable } from "@/lib/db/schema";
import type { EventRecord } from "@/lib/api/types";

import EventDetailPageClient from "./pageClient";

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({
  params,
}: EventDetailPageProps): Promise<Metadata> {
  const { eventId } = await params;
  if (!eventId) {
    return { title: "Event" };
  }

  const event = await findById<EventRecord>(eventsTable, eventId).catch(
    () => null,
  );
  const title = event?.title?.trim();

  return {
    title: title || "Event",
  };
}

export default function EventDetailPage() {
  return <EventDetailPageClient />;
}
