import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { requireMember } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import { cleanExec } from "@/lib/execs/patch";
import { cleanAccessCardId } from "@/lib/signups/access-card";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { execsTable, signupsTable } from "@/lib/db/schema";

export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();

  const signup = await findSignupByUserId(user.sub);
  const exec = signup?.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  return NextResponse.json(
    exec
      ? { ...toWireRecord(exec), accessCardId: signup?.accessCardId ?? "" }
      : null,
  );
};

export const PATCH = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();

  const signup = await findSignupByUserId(user.sub);
  if (!signup?.execKey) {
    return NextResponse.json({ error: "No linked profile" }, { status: 404 });
  }

  const body = await jsonObject<ExecRecord & { accessCardId?: string }>(req);
  if (!body) return badJson();
  // cleanExec omits name/title/isCurrentExec: those are the approver's.
  const cleaned = cleanExec(body);
  if ("error" in cleaned) {
    return NextResponse.json({ error: cleaned.error }, { status: 400 });
  }

  let accessCardId = signup.accessCardId;
  if ("accessCardId" in body) {
    const card = cleanAccessCardId(body.accessCardId);
    if ("error" in card) {
      return NextResponse.json({ error: card.error }, { status: 400 });
    }
    accessCardId = card.value;
    // Never spread `body` into signupsTable: that would let a member set
    // their own status, mailDailyLimit or keycloakUserId.
    await update<SignupRecord>(signupsTable, signup.id, { accessCardId });
  }

  const exec = await update<ExecRecord>(
    execsTable,
    signup.execKey,
    cleaned.patch,
  );
  if (!exec) return notFound();
  return NextResponse.json({ ...toWireRecord(exec), accessCardId });
};
