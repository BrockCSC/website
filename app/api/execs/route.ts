import { NextResponse, type NextRequest } from "next/server";
import { requireApprover, requireMember } from "@/lib/auth/session";
import { create, findAll, toWireRecord } from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import type { ExecRecord } from "@/lib/api/types";

/**
 * Hiding a tile has to hold at the API, not just on the team page: this route
 * is public, so filtering in the browser would leave the record a curl away.
 */
export const GET = async (req: NextRequest) => {
  const execs = await findAll<ExecRecord>(execsTable);
  const visible = (await requireMember(req))
    ? execs
    : execs.filter((exec) => !exec.hidden);
  return NextResponse.json(visible.map(toWireRecord));
};

export const POST = async (req: NextRequest) => {
  if (!(await requireApprover(req))) {
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
