import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import {
  createItemHandlers,
  findAll,
  remove,
  toWireRecord,
  update,
} from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";

export const { GET } = createItemHandlers<ExecRecord>(execsTable);

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!requireApprover(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const patch = (await req.json()) as Partial<ExecRecord>;
  const entity = await update<ExecRecord>(execsTable, id, patch);
  if (!entity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(entity));
};

/** Also unlinks any account pointing at this tile, so nothing dangles. */
export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!requireApprover(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await params;
  const removed = await remove(execsTable, id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signups = await findAll<SignupRecord>(signupsTable);
  await Promise.all(
    signups
      .filter((signup) => signup.execKey === id)
      .map((signup) =>
        update<SignupRecord>(signupsTable, signup.id, { execKey: null }),
      ),
  );

  return new NextResponse(null, { status: 204 });
};
