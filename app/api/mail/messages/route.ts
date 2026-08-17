import { NextResponse, type NextRequest } from "next/server";
import { listMessages } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../auth";

export const GET = async (req: NextRequest) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

  const params = new URL(req.url).searchParams;
  const search = params.get("search")?.trim() ?? "";
  const mailboxId = params.get("mailbox") ?? undefined;
  if (!mailboxId && !search) {
    return NextResponse.json(
      { error: "mailbox or search is required" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await listMessages(token, {
      mailboxId,
      search,
      limit: Math.min(Number(params.get("limit")) || 50, 100),
      position: Math.max(Number(params.get("position")) || 0, 0),
      threaded: params.get("threaded") === "1",
    }),
  );
};
