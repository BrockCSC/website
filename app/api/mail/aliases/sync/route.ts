import { NextResponse, type NextRequest } from "next/server";
import { requireMailAdmin } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { notAuthorized } from "@/lib/json";
import { syncMailRouting } from "@/lib/mail/provision";

export const POST = async (req: NextRequest) => {
  if (!(await requireMailAdmin(req))) return notAuthorized();
  if (!ownsIdentities()) return NextResponse.json({ rehearsed: true });
  try {
    await syncMailRouting();
  } catch (err) {
    return NextResponse.json(
      {
        error: `The mail server refused part of the routing: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
};
