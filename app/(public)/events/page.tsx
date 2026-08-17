import type { Metadata } from "next";

import EventsPageClient from "./pageClient";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <EventsPageClient initialQuery={q ?? ""} />;
}
