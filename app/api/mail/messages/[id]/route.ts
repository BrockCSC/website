import { NextResponse, type NextRequest } from "next/server";
import { getMessage } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../../auth";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();
  const { id } = await params;
  return NextResponse.json(await getMessage(token, id));
};
