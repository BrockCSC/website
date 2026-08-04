import { createCollectionHandlers } from "@/lib/db/repository";
import { eventsTable } from "@/lib/db/schema";
import type { EventRecord } from "@/lib/api/types";

export const { GET, POST } = createCollectionHandlers<EventRecord>(eventsTable);
