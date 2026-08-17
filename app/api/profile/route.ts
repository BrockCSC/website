import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord } from "@/lib/api/types";
import { requireMember } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import { cleanExec } from "@/lib/execs/patch";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { execsTable } from "@/lib/db/schema";

export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();

  const signup = await findSignupByUserId(user.sub);
  const exec = signup?.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  return NextResponse.json(exec ? toWireRecord(exec) : null);
};

export const PATCH = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();

  const signup = await findSignupByUserId(user.sub);
  if (!signup?.execKey) {
    return NextResponse.json({ error: "No linked profile" }, { status: 404 });
  }

  const body = await jsonObject<ExecRecord>(req);
  if (!body) return badJson();
  const current = await findById<ExecRecord>(execsTable, signup.execKey);
  // cleanExec omits name/title/isCurrentExec: those are the approver's.
  const cleaned = cleanExec(body, current?.image?.url);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  const exec = await update<ExecRecord>(
    execsTable,
    signup.execKey,
    cleaned.patch,
  );
  if (!exec) return notFound();
  return NextResponse.json(toWireRecord(exec));
};
