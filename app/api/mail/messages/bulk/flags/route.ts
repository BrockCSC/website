import { NextResponse, type NextRequest } from "next/server";
import { setKeywords } from "@/lib/mail/jmap-mail";
import { mailWriter } from "../../../auth";
import { jsonObject } from "@/lib/json";

const KEYWORDS = { seen: "$seen", flagged: "$flagged" } as const;
const MAX_IDS = 200;

export const POST = async (req: NextRequest) => {
  const scope = await mailWriter(req);
  if (scope instanceof NextResponse) return scope;

  const body = await jsonObject<Record<string, unknown>>(req);
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];
  const wanted = Object.entries(KEYWORDS).flatMap(([key, keyword]) =>
    typeof body?.[key] === "boolean" ? [[keyword, body[key]] as const] : [],
  );
  if (!ids.length || ids.length > MAX_IDS || wanted.length === 0) {
    return NextResponse.json(
      {
        error: `Give 1-${MAX_IDS} ids and set seen and/or flagged to a boolean`,
      },
      { status: 400 },
    );
  }

  await setKeywords(scope.access, ids, Object.fromEntries(wanted));
  return NextResponse.json({ ok: true });
};
