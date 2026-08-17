import { NextResponse, type NextRequest } from "next/server";
import { getThread } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../../auth";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();
  const { id } = await params;
  return NextResponse.json({ messages: await getThread(token, id) });
};
