import { createCollectionHandlers } from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import type { ExecRecord } from "@/lib/api/types";

export const { GET, POST } = createCollectionHandlers<ExecRecord>(execsTable);
