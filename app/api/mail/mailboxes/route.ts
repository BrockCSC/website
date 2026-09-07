import { NextResponse, type NextRequest } from "next/server";
import { listMailboxes } from "@/lib/mail/jmap-mail";
import { mailAccess, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const access = await mailAccess(req);
  if (!access) return unauthorized();
  return NextResponse.json(await listMailboxes(access));
};
