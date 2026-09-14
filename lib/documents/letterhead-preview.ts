import {
  BRAND_ACCENT_COLOR,
  BRAND_COLOR,
  CLUB_MAILING_ADDRESS,
  CLUB_NAME,
} from "@/lib/brand";
import { LETTERHEAD_PAGE_MIN_HEIGHT, LETTERHEAD_PAGE_WIDTH } from "./page-size";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

const FONT = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

/**
 * A client-side approximation of lib/documents/letterhead.ts's chrome, for
 * the editor's own live preview only. It deliberately skips the server-side
 * sanitize pass (isomorphic-dompurify drags in a jsdom fallback that has no
 * business in the client bundle) so the exec sees exactly what they typed;
 * renderLetterheadDocument on the server is the only place a document is
 * ever actually produced, and it re-sanitizes independently of this preview.
 */
export const previewLetterheadHtml = (input: {
  title: string;
  category: string;
  bodyHtml: string;
}): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
</head>
<body style="margin:0;padding:24px;background:#e5e5e5;${FONT}">
<div style="max-width:${LETTERHEAD_PAGE_WIDTH}px;min-height:${LETTERHEAD_PAGE_MIN_HEIGHT}px;margin:0 auto;background:#ffffff;box-sizing:border-box;padding:48px 56px;color:#191619">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;padding-bottom:16px;border-bottom:3px solid ${BRAND_COLOR}">
<tr>
<td valign="middle" style="vertical-align:middle;padding-right:16px">
<img src="/email-logo.png" width="56" height="56" alt="BrockCSC" style="display:block;width:56px;height:56px;border-radius:10px;border:0">
</td>
<td valign="middle" style="vertical-align:middle;border-left:3px solid ${BRAND_ACCENT_COLOR};padding-left:16px">
<div style="font-size:18px;font-weight:700;line-height:1.35;color:${BRAND_COLOR}">${escape(CLUB_NAME)}</div>
<div style="font-size:12px;line-height:1.45;color:#6b7280">${escape(CLUB_MAILING_ADDRESS)}</div>
</td>
</tr>
</table>
<div style="margin-top:28px;font-size:14px;line-height:1.6">${input.bodyHtml}</div>
<div style="margin-top:40px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:10px;line-height:1.5;color:#9ca3af">
${escape(CLUB_NAME)} — ${escape(input.category || "Uncategorized")} — preview only
</div>
</div>
</body>
</html>`;
