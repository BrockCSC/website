import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { create, findById, update } from "@/lib/db/repository";
import { findSignupByUserId, isExecKeyClaimed } from "@/lib/db/signups";
import { execsTable, signupsTable } from "@/lib/db/schema";

export const POST = async (req: NextRequest) => {
  const user = requireAdmin(req);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const signup = await findSignupByUserId(user.sub);
  if (!signup) {
    return NextResponse.json({ error: "No signup record" }, { status: 404 });
  }
  if (signup.execKey) {
    return NextResponse.json({ error: "Already linked" }, { status: 409 });
  }

  const { execKey, createNew } = (await req.json()) as {
    execKey?: string;
    createNew?: boolean;
  };

  let key = execKey;
  if (createNew) {
    const exec = await create<ExecRecord>(execsTable, {
      name: [signup.firstName, signup.lastName].filter(Boolean).join(" "),
      title: "Executive",
      isCurrentExec: true,
    });
    key = exec.id;
  } else if (!key || !(await findById<ExecRecord>(execsTable, key))) {
    return NextResponse.json({ error: "Unknown exec" }, { status: 404 });
  } else if (await isExecKeyClaimed(key)) {
    return NextResponse.json(
      { error: "Someone has already claimed that profile." },
      { status: 409 },
    );
  }

  await update<SignupRecord>(signupsTable, signup.id, { execKey: key });
  return NextResponse.json({ execKey: key });
};
