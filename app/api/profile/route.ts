import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord } from "@/lib/api/types";
import { requireMember } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import { cleanExec } from "@/lib/execs/patch";
import { execsTable } from "@/lib/db/schema";

const unauthorized = () =>
  NextResponse.json({ error: "Not authorized" }, { status: 401 });

export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return unauthorized();

  const signup = await findSignupByUserId(user.sub);
  const exec = signup?.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  return NextResponse.json(exec ? toWireRecord(exec) : null);
};

export const PATCH = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return unauthorized();

  const signup = await findSignupByUserId(user.sub);
  if (!signup?.execKey) {
    return NextResponse.json({ error: "No linked profile" }, { status: 404 });
  }

  const body = (await req.json()) as ExecRecord;
  // Only the fields cleanExec returns: name, title and isCurrentExec are the
  // approver's to set, not the exec's own.
  const cleaned = cleanExec(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  const exec = await update<ExecRecord>(
    execsTable,
    signup.execKey,
    cleaned.patch,
  );
  if (!exec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(exec));
};
