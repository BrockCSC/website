import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import { requireApprover } from "@/lib/auth/session";
import { findExecMatchingName } from "@/lib/db/execs";
import { findAll, toWireRecord } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";
import { notAuthorized } from "@/lib/json";

export const GET = async (req: NextRequest) => {
  if (!(await requireApprover(req))) return notAuthorized();

  const signups = await findAll<SignupRecord>(signupsTable);
  const withMatches = await Promise.all(
    signups.map(async (signup) => ({
      ...toWireRecord(signup),
      matchedExec:
        signup.status === "pending"
          ? await findExecMatchingName(signup.firstName, signup.lastName)
          : null,
    })),
  );

  return NextResponse.json(withMatches);
};
