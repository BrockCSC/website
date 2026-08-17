import { NextResponse, type NextRequest } from "next/server";
import { downloadBlob, getMessage, type BodyPart } from "@/lib/mail/jmap-mail";
import {
  contentId,
  EMAIL_IFRAME_CSP,
  emailBodyToText,
  sanitizeEmailBody,
} from "@/lib/mail/sanitize";
import { mailToken } from "../../../auth";

const INLINE_MAX_BYTES = 2 * 1024 * 1024;
const INLINE_TOTAL_BYTES = 8 * 1024 * 1024;

/** Inlined rather than proxied: the sandboxed iframe sends no session cookie. */
const inlineImages = async (
  token: string,
  parts: BodyPart[] | undefined,
): Promise<Record<string, string>> => {
  const inline: Record<string, string> = {};
  let total = 0;

  for (const part of parts ?? []) {
    if (!part.cid || !part.blobId || !part.type.startsWith("image/")) continue;
    if (part.size > INLINE_MAX_BYTES) continue;
    if (total + part.size > INLINE_TOTAL_BYTES) break;

    try {
      const res = await downloadBlob(
        token,
        part.blobId,
        part.name ?? "image",
        part.type,
      );
      const bytes = Buffer.from(await res.arrayBuffer());
      total += bytes.byteLength;
      inline[contentId(part.cid)] =
        `data:${part.type};base64,${bytes.toString("base64")}`;
    } catch {
      continue;
    }
  }

  return inline;
};

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
  const search = new URL(req.url).searchParams;

  const { html: body, blocked } = isHtml
    ? sanitizeEmailBody(raw ?? "", {
        inline: await inlineImages(token, message.attachments),
        allowRemote: search.get("images") === "1",
      })
    : { html: emailBodyToText(raw ?? ""), blocked: false };

  const dark = !isHtml && search.get("theme") === "dark";
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
      "x-images-blocked": blocked ? "1" : "0",
    },
  });
};
