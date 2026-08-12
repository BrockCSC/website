import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { findAll, toWireRecord } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";

export const GET = async (req: NextRequest) => {
  if (!requireApprover(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const signups = await findAll<SignupRecord>(signupsTable);
  return NextResponse.json(signups.map(toWireRecord));
};
