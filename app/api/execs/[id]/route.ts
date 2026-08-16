import { NextResponse, type NextRequest } from "next/server";
import { requireApprover, requireMember } from "@/lib/auth/session";
import {
  findAll,
  findById,
  remove,
  toWireRecord,
  update,
} from "@/lib/db/repository";
import { asBool, cleanExec } from "@/lib/execs/patch";
import { findSignupByExecKey } from "@/lib/db/signups";
import { makeMailboxReadOnly } from "@/lib/mail/provision";
import { badJson, jsonObject } from "@/lib/json";
import { execsTable, signupsTable } from "@/lib/db/schema";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";

/** A hidden tile reads as absent to the public, same as the collection route. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const exec = await findById<ExecRecord>(execsTable, id);
  if (!exec || (exec.hidden && !(await requireMember(req)))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(exec));
};

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await jsonObject<ExecRecord>(req);
  if (!body) return badJson();
  const cleaned = cleanExec(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }
  const before = await findById<ExecRecord>(execsTable, id);
  const stillCurrent = asBool(body.isCurrentExec);

  const entity = await update<ExecRecord>(execsTable, id, {
    ...cleaned.patch,
    name: body.name,
    title: body.title,
    isCurrentExec: stillCurrent,
  });
  if (!entity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (before?.isCurrentExec !== false && !stillCurrent) {
    const signup = await findSignupByExecKey(id);
    if (signup?.username) await makeMailboxReadOnly(signup.username);
  }
  return NextResponse.json(toWireRecord(entity));
};

/** Also unlinks any account pointing at this tile, so nothing dangles. */
export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) {
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
