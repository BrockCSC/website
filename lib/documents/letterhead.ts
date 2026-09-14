import {
  BRAND_ACCENT_COLOR,
  BRAND_COLOR,
  CLUB_MAILING_ADDRESS,
  CLUB_NAME,
} from "@/lib/brand";
import { escapeHtml, sanitizeOutboundHtml } from "@/lib/mail/sanitize";
import { LETTERHEAD_PAGE_MIN_HEIGHT, LETTERHEAD_PAGE_WIDTH } from "./page-size";

const siteUrl = () => process.env.MAIL_SITE_URL ?? "https://brockcsc.ca";

const FONT = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

/**
 * DOMPurify's tag list (lib/mail/sanitize.ts) has no html/head/meta/style, so
 * sanitizing the assembled document would strip the CSP below — sanitize only
 * the exec-edited body fragment, then wrap it in chrome we wrote ourselves.
 */
export const renderLetterheadDocument = (input: {
  title: string;
  category: string;
  bodyHtml: string;
  generatedAt: Date;
}): string => {
  const safeBody = sanitizeOutboundHtml(input.bodyHtml);
  const site = siteUrl();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;background:#ffffff;${FONT}">
<div style="width:${LETTERHEAD_PAGE_WIDTH}px;min-height:${LETTERHEAD_PAGE_MIN_HEIGHT}px;box-sizing:border-box;padding:48px 56px;color:#191619">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;padding-bottom:16px;border-bottom:3px solid ${BRAND_COLOR}">
<tr>
<td valign="middle" style="vertical-align:middle;padding-right:16px">
<img src="${site}/email-logo.png" width="56" height="56" alt="BrockCSC" style="display:block;width:56px;height:56px;border-radius:10px;border:0">
</td>
<td valign="middle" style="vertical-align:middle;border-left:3px solid ${BRAND_ACCENT_COLOR};padding-left:16px">
<div style="font-size:18px;font-weight:700;line-height:1.35;color:${BRAND_COLOR}">${escapeHtml(CLUB_NAME)}</div>
<div style="font-size:12px;line-height:1.45;color:#6b7280">${escapeHtml(CLUB_MAILING_ADDRESS)}</div>
</td>
</tr>
</table>
<div style="margin-top:28px;font-size:14px;line-height:1.6">${safeBody}</div>
<div style="margin-top:40px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:10px;line-height:1.5;color:#9ca3af">
${escapeHtml(CLUB_NAME)} — ${escapeHtml(input.category)} — generated ${escapeHtml(input.generatedAt.toISOString())}
</div>
</div>
</body>
</html>`;
};
