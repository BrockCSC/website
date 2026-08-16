import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFor } from "@/lib/auth/mail-token";
import { requireMember } from "@/lib/auth/session";
import { getMessage } from "@/lib/mail/jmap-mail";
import {
  EMAIL_IFRAME_CSP,
  emailBodyToText,
  sanitizeEmailHtml,
} from "@/lib/mail/sanitize";

/**
 * Serves one message body as a standalone document for a sandboxed iframe.
 * Sanitised here and served under a strict CSP, so hostile markup has to defeat
 * both to reach the reader.
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireMember(req))) {
    return new NextResponse("Not authorized", { status: 401 });
  }
  const token = await accessTokenFor(req);
  if (!token) return new NextResponse("Sign in again", { status: 401 });

  const { id } = await params;
  const message = await getMessage(token, id);

  const part = message.htmlBody?.[0] ?? message.textBody?.[0];
  const raw = part?.partId ? message.bodyValues?.[part.partId]?.value : "";
  const isHtml = (part?.type ?? "").includes("html");
  const body = isHtml
    ? sanitizeEmailHtml(raw ?? "")
    : emailBodyToText(raw ?? "");

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${EMAIL_IFRAME_CSP}">
<style>body{margin:0;padding:16px;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;color:#111;word-wrap:break-word}
img{max-width:100%;height:auto}table{max-width:100%}a{color:#9a4440}</style>
</head><body>${body}</body></html>`;

  return new NextResponse(doc, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": EMAIL_IFRAME_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "private, no-store",
    },
  });
};
