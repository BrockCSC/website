import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { findAll } from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** Club addresses for compose autocomplete: current execs who hold a mailbox. */
export const GET = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const [signups, execs] = await Promise.all([
    findAll<SignupRecord>(signupsTable),
    findAll<ExecRecord>(execsTable),
  ]);
  const current = new Map(
    execs.filter((exec) => exec.isCurrentExec).map((exec) => [exec.id, exec]),
  );

  const contacts = signups
    .filter(
      (signup) =>
        signup.status === "approved" &&
        signup.username &&
        signup.execKey &&
        current.has(signup.execKey),
    )
    .map((signup) => ({
      name:
        current.get(signup.execKey!)?.name ??
        [signup.firstName, signup.lastName].filter(Boolean).join(" "),
      email: `${signup.username}@${domain()}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(contacts);
};
