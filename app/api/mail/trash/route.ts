import { NextResponse, type NextRequest } from "next/server";
import { purgeTrash } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../auth";

const RETENTION_DAYS = Number(process.env.MAIL_TRASH_DAYS ?? 7);

export const POST = async (req: NextRequest) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

  const purged = await purgeTrash(token, RETENTION_DAYS);
  return NextResponse.json({ purged, days: RETENTION_DAYS });
};
