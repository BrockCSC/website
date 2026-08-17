import { NextResponse, type NextRequest } from "next/server";
import { listMailboxes } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();
  return NextResponse.json(await listMailboxes(token));
};
