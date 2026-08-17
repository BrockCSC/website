import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { eventsTable } from "@/lib/db/schema";

const SITE = "https://brockcsc.ca";

/** Event pages come from the database, so this is built per request. */
export const dynamic = "force-dynamic";

const listEvents = async () => {
  try {
    return await db
      .select({ id: eventsTable.id, createdAt: eventsTable.createdAt })
      .from(eventsTable);
  } catch {
    return [];
  }
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await listEvents();

  return [
    ...["/", "/events", "/team", "/cs-guide", "/links"].map((path) => ({
      url: `${SITE}${path}`,
      changeFrequency: "weekly" as const,
    })),
    ...events.map((event) => ({
      url: `${SITE}/events/${event.id}`,
      lastModified: event.createdAt,
    })),
  ];
}
