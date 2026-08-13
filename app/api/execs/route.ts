import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import {
  create,
  createCollectionHandlers,
  toWireRecord,
} from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import type { ExecRecord } from "@/lib/api/types";

export const { GET } = createCollectionHandlers<ExecRecord>(execsTable);

export const POST = async (req: NextRequest) => {
  if (!requireApprover(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const input = (await req.json()) as ExecRecord;
  return NextResponse.json(
    toWireRecord(await create<ExecRecord>(execsTable, input)),
    {
      status: 201,
    },
  );
};
