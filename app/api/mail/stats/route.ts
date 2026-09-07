import { NextResponse, type NextRequest } from "next/server";
import { mailStats } from "@/lib/mail/jmap-mail";
import { mailAccess, unauthorized } from "../auth";

/** Counts by mailbox role over the last `days`, for the dashboard. */
export const GET = async (req: NextRequest) => {
  const access = await mailAccess(req);
  if (!access) return unauthorized();

  const days = Number(new URL(req.url).searchParams.get("days"));
  return NextResponse.json(
    await mailStats(access, Math.min(Math.max(days || 30, 1), 365)),
  );
};
