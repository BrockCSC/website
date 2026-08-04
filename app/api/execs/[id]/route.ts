import { createItemHandlers } from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import type { ExecRecord } from "@/lib/api/types";

export const { GET, PATCH, DELETE } =
  createItemHandlers<ExecRecord>(execsTable);
