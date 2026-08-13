import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord } from "@/lib/api/types";
import { requireMember } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import { sanitiseSocials } from "@/lib/execs/socials";
import { isValidTerm } from "@/lib/execs/terms";
import { execsTable } from "@/lib/db/schema";

const MAX_DESCRIPTION = 2000;
/** Only images this app stored: an arbitrary URL here loads on the team page. */
const UPLOAD_URL = /^\/uploads\/[A-Za-z0-9/._-]+$/;
const OBJECT_POSITION = /^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

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
  if (body.term && !isValidTerm(body.term)) {
    return NextResponse.json({ error: "Unknown term." }, { status: 400 });
  }
  if ((body.description?.length ?? 0) > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: "That bio is too long." },
      { status: 400 },
    );
  }
  const url = body.image?.url?.trim() ?? "";
  if (url && !UPLOAD_URL.test(url)) {
    return NextResponse.json(
      { error: "Photos must be uploaded here rather than linked." },
      { status: 400 },
    );
  }
  const position = body.image?.position ?? "";

  const exec = await update<ExecRecord>(execsTable, signup.execKey, {
    description: body.description,
    term: body.term,
    socials: sanitiseSocials(body.socials),
    image: {
      url,
      position: OBJECT_POSITION.test(position) ? position : "50% 50%",
    },
    // Coerced: this now decides what the public API returns.
    hidden: body.hidden === undefined ? undefined : body.hidden === true,
  });
  if (!exec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(exec));
};
