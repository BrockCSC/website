import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { sendMessage } from "@/lib/mail/jmap-mail";

const MAX_RECIPIENTS = 50;
const MAX_TEXT_BYTES = 100_000;
const MAX_HTML_BYTES = 400_000;
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const addresses = (value: unknown): string[] | null =>
  Array.isArray(value) &&
  value.every(
    (entry) => typeof entry === "string" && ADDRESS.test(entry.trim()),
  )
    ? value.map((entry: string) => entry.trim())
    : null;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export const POST = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) {
    return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  }

  // from is deliberately ignored: the sender comes from the session identity.
  const body = (await req.json().catch(() => null)) as {
    to?: unknown;
    cc?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
  } | null;
  if (!body) return bad("Body must be JSON");

  const to = addresses(body.to);
  if (!to?.length) return bad("to must be a non-empty array of addresses");
  const cc = body.cc === undefined ? [] : addresses(body.cc);
  if (!cc) return bad("cc must be an array of addresses");
  if (to.length + cc.length > MAX_RECIPIENTS) {
    return bad(`No more than ${MAX_RECIPIENTS} recipients`);
  }
  if (typeof body.subject !== "string") return bad("subject must be a string");
  if (typeof body.text !== "string") return bad("text must be a string");
  if (Buffer.byteLength(body.text) > MAX_TEXT_BYTES) {
    return bad(`text must be under ${MAX_TEXT_BYTES} bytes`);
  }
  if (body.html !== undefined && typeof body.html !== "string") {
    return bad("html must be a string");
  }
  if (body.html && Buffer.byteLength(body.html) > MAX_HTML_BYTES) {
    return bad(`html must be under ${MAX_HTML_BYTES} bytes`);
  }

  const id = await sendMessage(token, {
    to,
    cc,
    subject: body.subject,
    text: body.text,
    html: body.html || undefined,
  });
  return NextResponse.json({ id });
};
