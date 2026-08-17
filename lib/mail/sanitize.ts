import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS =
  `a b blockquote br caption center code col colgroup dd div dl dt em figcaption
   figure h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strike strong sub
   sup table tbody td tfoot th thead tr u ul`.split(/\s+/);

const ALLOWED_ATTR =
  `align alt colspan dir height href lang rowspan src style title valign width`.split(
    /\s+/,
  );

const ALLOWED_STYLES = new Set(
  `background-color border border-bottom border-collapse border-color
   border-left border-radius border-right border-style border-top border-width
   color font-family font-size font-style font-weight height letter-spacing
   line-height list-style-type margin margin-bottom margin-left margin-right
   margin-top max-width padding padding-bottom padding-left padding-right
   padding-top text-align text-decoration vertical-align white-space width`.split(
    /\s+/,
  ),
);

const LAYOUT_ATTR = `align colspan dir height lang rowspan valign width`.split(
  /\s+/,
);

const SAFE_URL = /^(?:https?:|mailto:|tel:|cid:|#)/i;
const UNSAFE_STYLE_VALUE = /url\(|expression|javascript:|@import|[<\\]/i;

const normalizeUrl = (url: string) => url.replace(/[\x00-\x20\u00a0]/g, "");

type ImagePolicy = {
  /** Content-ID, angle brackets stripped and lowercased, to a `data:` URI. */
  inline?: Record<string, string>;
  allowRemote?: boolean;
};

type ActivePolicy = Required<ImagePolicy> & { blocked: boolean };

const closedPolicy = (): ActivePolicy => ({
  inline: {},
  allowRemote: false,
  blocked: false,
});

let policy = closedPolicy();

const ownHost = () => {
  try {
    return new URL(process.env.MAIL_SITE_URL ?? "https://brockcsc.ca").host;
  } catch {
    return "brockcsc.ca";
  }
};

const isOwnSite = (url: string) => {
  try {
    return new URL(url).host === ownHost();
  } catch {
    return false;
  }
};

export const contentId = (cid: string) =>
  cid.replace(/^<|>$/g, "").trim().toLowerCase();

const filterStyle = (style: string) =>
  style
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      const prop = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      const ok =
        colon > 0 &&
        value &&
        ALLOWED_STYLES.has(prop) &&
        !UNSAFE_STYLE_VALUE.test(value);
      return ok ? `${prop}:${value}` : "";
    })
    .filter(Boolean)
    .join(";");

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (typeof el.getAttribute !== "function") return;

  const style = el.getAttribute("style");
  if (style !== null) {
    const filtered = filterStyle(style);
    if (filtered) el.setAttribute("style", filtered);
    else el.removeAttribute("style");
  }

  const tag = el.tagName.toLowerCase();
  if (tag === "a") {
    const href = el.getAttribute("href");
    if (href !== null && !SAFE_URL.test(normalizeUrl(href))) {
      el.removeAttribute("href");
    }
    if (el.hasAttribute("href")) {
      el.setAttribute("rel", "noopener noreferrer nofollow");
      el.setAttribute("target", "_blank");
    }
  }
  if (tag === "img") {
    const src = normalizeUrl(el.getAttribute("src") ?? "");
    el.removeAttribute("src");
    if (/^cid:/i.test(src)) {
      el.setAttribute("src", policy.inline[contentId(src.slice(4))] ?? src);
    } else if (/^https?:/i.test(src)) {
      if (policy.allowRemote || isOwnSite(src)) {
        el.setAttribute("src", src);
      } else {
        el.setAttribute("data-blocked-src", src);
        policy.blocked = true;
      }
    }
  }
});

const run = (
  html: string,
  images: ImagePolicy,
): { html: string; blocked: boolean } => {
  policy = { ...closedPolicy(), ...images };
  try {
    return {
      html: DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOWED_URI_REGEXP: SAFE_URL,
        ADD_URI_SAFE_ATTR: LAYOUT_ATTR,
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      }),
      blocked: policy.blocked,
    };
  } finally {
    policy = closedPolicy();
  }
};

export const sanitizeEmailBody = (
  html: string,
  images: ImagePolicy,
): { html: string; blocked: boolean } => run(html, images);

export const sanitizeOutboundHtml = (html: string): string =>
  run(html, {}).html.replace(/ data-blocked-src="/g, ' src="');

export const escapeHtml = (text: string) =>
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

export const emailBodyToText = (text: string): string =>
  escapeHtml(text)
    .replace(/https?:\/\/[^\s<>"']+/g, (url) => {
      const trailing = /[.,;:!?)\]}]+$/.exec(url)?.[0] ?? "";
      const link = url.slice(0, url.length - trailing.length);
      return `<a href="${link}" rel="noopener noreferrer nofollow" target="_blank">${link}</a>${trailing}`;
    })
    .replace(/\r?\n/g, "<br />");

export const EMAIL_IFRAME_CSP =
  "default-src 'none'; script-src 'none'; img-src 'self' https: data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
