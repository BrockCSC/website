import { NextResponse, type NextRequest } from "next/server";
import { getThread } from "@/lib/mail/jmap-mail";
import { mailAccess, unauthorized } from "../../auth";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const access = await mailAccess(req);
  if (!access) return unauthorized();
  const { id } = await params;
  return NextResponse.json({ messages: await getThread(access, id) });
};
