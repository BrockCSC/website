import { NextResponse, type NextRequest } from "next/server";
import { requireApprover, requireMember } from "@/lib/auth/session";
import { create, findAll, toWireRecord } from "@/lib/db/repository";
import { asBool, cleanExec } from "@/lib/execs/patch";
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
  const body = (await req.json()) as ExecRecord;
  const cleaned = cleanExec(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const input: ExecRecord = {
    ...cleaned.patch,
    name: body.name,
    title: body.title,
    isCurrentExec: asBool(body.isCurrentExec),
  };
  return NextResponse.json(
    toWireRecord(await create<ExecRecord>(execsTable, input)),
    {
      status: 201,
    },
  );
};
