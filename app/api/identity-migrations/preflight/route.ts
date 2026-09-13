import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { ownsIdentities } from "@/lib/env";
import { lastPreflight, runPreflight } from "@/lib/identity/preflight";
import { notAuthorized } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

export const GET = async (req: NextRequest) => {
  if (!(await requireApprover(req))) return notAuthorized();
  return NextResponse.json({
    available: ownsIdentities(),
    report: lastPreflight(),
  });
};

/**
 * Exercises every Stalwart call a rename makes on a throwaway account pair
 * and always cleans up. Production only: elsewhere renames are rehearsed and
 * the shared mail server is left alone.
 */
export const POST = async (req: NextRequest) => {
  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();
  if (!ownsIdentities()) {
    return NextResponse.json(
      {
        error:
          "The preflight only runs in production; renames here are rehearsed and need no preflight.",
      },
      { status: 409 },
    );
  }
  const limited = rateLimit(req, "preflight", 3, 60 * 60_000, approver.sub);
  if (limited) return limited;
  console.info(`migration preflight run by ${approver.email || approver.sub}`);
  return NextResponse.json(await runPreflight());
};
