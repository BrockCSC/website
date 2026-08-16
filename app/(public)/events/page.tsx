import type { Metadata } from "next";

import EventsPageClient from "./pageClient";

export const metadata: Metadata = {
  title: "Events",
};

export default function EventsPage() {
  return <EventsPageClient />;
}
