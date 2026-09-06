import { NextResponse, type NextRequest } from "next/server";
import { setKeywords } from "@/lib/mail/jmap-mail";
import { mailWriter } from "../../../auth";
import { jsonObject } from "@/lib/json";

const KEYWORDS = { seen: "$seen", flagged: "$flagged" } as const;

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const scope = await mailWriter(req);
  if (scope instanceof NextResponse) return scope;

  const body = await jsonObject<Record<string, unknown>>(req);
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
  await setKeywords(scope.access, [id], Object.fromEntries(wanted));
  return NextResponse.json({ ok: true });
};
