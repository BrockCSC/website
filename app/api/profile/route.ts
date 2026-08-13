import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import { sanitiseSocials } from "@/lib/execs/socials";
import { isValidTerm } from "@/lib/execs/terms";
import { execsTable } from "@/lib/db/schema";

const unauthorized = () =>
  NextResponse.json({ error: "Not authorized" }, { status: 401 });

export const GET = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return unauthorized();

  const signup = await findSignupByUserId(user.sub);
  const exec = signup?.execKey
    ? await findById<ExecRecord>(execsTable, signup.execKey)
    : null;
  return NextResponse.json(exec ? toWireRecord(exec) : null);
};

export const PATCH = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return unauthorized();

  const signup = await findSignupByUserId(user.sub);
  if (!signup?.execKey) {
    return NextResponse.json({ error: "No linked profile" }, { status: 404 });
  }

  const body = (await req.json()) as ExecRecord;
  if (body.term && !isValidTerm(body.term)) {
    return NextResponse.json({ error: "Unknown term." }, { status: 400 });
  }
  const exec = await update<ExecRecord>(execsTable, signup.execKey, {
    description: body.description,
    term: body.term,
    socials: sanitiseSocials(body.socials),
    image: body.image,
    hidden: body.hidden,
  });
  if (!exec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(exec));
};
