import { NextResponse, type NextRequest } from "next/server";
import { getMessage } from "@/lib/mail/jmap-mail";
import { mailAccess, unauthorized } from "../../auth";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const access = await mailAccess(req);
  if (!access) return unauthorized();
  const { id } = await params;
  return NextResponse.json(await getMessage(access, id));
};
