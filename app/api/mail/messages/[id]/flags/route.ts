import { NextResponse, type NextRequest } from "next/server";
import { setKeywords } from "@/lib/mail/jmap-mail";
import { mailToken, unauthorized } from "../../../auth";

/** Only these two keywords are settable; the rest are the server's business. */
const KEYWORDS = { seen: "$seen", flagged: "$flagged" } as const;

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return unauthorized();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const wanted = Object.entries(KEYWORDS).flatMap(([key, keyword]) =>
    typeof body?.[key] === "boolean" ? [[keyword, body[key]] as const] : [],
  );
  if (wanted.length === 0) {
    return NextResponse.json(
      { error: "Set seen and/or flagged to a boolean" },
      { status: 400 },
    );
  }

  const { id } = await params;
  await setKeywords(token, [id], Object.fromEntries(wanted));
  return NextResponse.json({ ok: true });
};
