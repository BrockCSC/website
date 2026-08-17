import { NextResponse, type NextRequest } from "next/server";
import { getMessage } from "@/lib/mail/jmap-mail";
import {
  EMAIL_IFRAME_CSP,
  emailBodyToText,
  sanitizeEmailHtml,
} from "@/lib/mail/sanitize";
import { mailToken } from "../../../auth";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const token = await mailToken(req);
  if (!token) return new NextResponse("Sign in again", { status: 401 });

  const { id } = await params;
  const message = await getMessage(token, id);

  const part = message.htmlBody?.[0] ?? message.textBody?.[0];
  const raw = part?.partId ? message.bodyValues?.[part.partId]?.value : "";
  const isHtml = (part?.type ?? "").includes("html");
  const body = isHtml
    ? sanitizeEmailHtml(raw ?? "")
    : emailBodyToText(raw ?? "");

  const dark = !isHtml && new URL(req.url).searchParams.get("theme") === "dark";
  const palette = dark
    ? { fg: "#f4f1ee", bg: "#1a181b", link: "#d98079" }
    : { fg: "#111", bg: "#fff", link: "#9a4440" };

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${EMAIL_IFRAME_CSP}">
<style>body{margin:0;padding:16px;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;color:${palette.fg};background:${palette.bg};word-wrap:break-word}
img{max-width:100%;height:auto}table{max-width:100%}a{color:${palette.link}}</style>
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
