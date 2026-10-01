import type { MessageSummary } from "@/lib/mail/jmap-mail";

type EmailAddress = NonNullable<MessageSummary["from"]>[number];

const QUOTE_STYLE =
  "margin:0 0 0 0.8ex;border-left:2px solid #ccc;padding-left:1ex";

const SAFE_URL = /^(?:https?:|mailto:|tel:|cid:|#)/i;

const BLOCK =
  /^(ADDRESS|ARTICLE|DD|DIV|DL|DT|H[1-6]|HR|OL|P|PRE|SECTION|TABLE|TR|UL)$/;

export const harden = (root: ParentNode) => {
  root
    .querySelectorAll("script,style,link,meta,base,iframe,object,embed,form")
    .forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      const unsafeUrl =
        /^(href|src)$/i.test(name) &&
        !SAFE_URL.test(value.replace(/[\s\u0000-\u001f]/g, ""));
      if (/^on/i.test(name) || unsafeUrl) el.removeAttribute(name);
    }
  });
};

const IMAGE_BOX =
  "p,div,td,th,li,figure,center,section,article,blockquote,h1,h2,h3,h4,h5,h6";

/** Logos, icons and spacers: gone from a quote without a word, as in native mail. */
const isSmall = (img: Element) =>
  ["width", "height"].some((name) => {
    const value = Number.parseInt(img.getAttribute(name) ?? "", 10);
    return Number.isFinite(value) && value <= 64;
  });

/**
 * Images a reply can't carry: blocked remote images, unresolved `cid:` parts
 * and inlined `data:` parts (harden drops their src). One that stands alone
 * in its block with a descriptive alt (a poster, a chart) becomes
 * "[image: alt]"; the rest (logos beside a name, icons in links, spacers) go
 * silently instead of leaving a broken box or a stray label.
 */
const replaceUnsendableImages = (root: HTMLElement) => {
  // Decide for every image first: a label put in for one must not count as
  // text beside the next.
  const verdicts = Array.from(root.querySelectorAll("img")).flatMap((img) => {
    const src = img.getAttribute("src") ?? "";
    if (src && !/^cid:/i.test(src) && !img.hasAttribute("data-blocked-src"))
      return [];
    const alt = (img.getAttribute("alt") ?? "").trim().replace(/\s+/g, " ");
    const box = img.parentElement?.closest(IMAGE_BOX) ?? img.parentElement;
    const alone =
      !box?.textContent?.trim() && !img.closest("a")?.textContent?.trim();
    const label =
      alone && !isSmall(img) && alt.split(" ").length > 3 ? alt : null;
    return [{ img, label }];
  });
  for (const { img, label } of verdicts) {
    if (label)
      img.replaceWith(img.ownerDocument.createTextNode(`[image: ${label}]`));
    else img.remove();
  }
};

const person = (address: EmailAddress) =>
  address.name && address.name !== address.email
    ? `${address.name} <${address.email}>`
    : address.email;

const people = (list: EmailAddress[] | null) =>
  (list ?? []).map(person).join(", ");

/**
 * The quoted original for a reply or forward, as page.tsx stores it in
 * `draft.quoteHtml`. Reply: an attribution line and an indented blockquote.
 * Forward: Gmail's "Forwarded message" header block and the body, unindented.
 */
export const buildQuote = async (
  message: MessageSummary,
  mode: "reply" | "forward" = "reply",
): Promise<string> => {
  const doc = document.implementation.createHTMLDocument("");
  const sender = message.from?.[0];
  const when = new Date(message.receivedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const body = doc.createElement(mode === "forward" ? "div" : "blockquote");
  if (mode === "reply") body.setAttribute("style", QUOTE_STYLE);
  try {
    const res = await fetch(
      `/api/mail/messages/${encodeURIComponent(message.id)}/body`,
    );
    if (!res.ok) throw new Error("body unavailable");
    const parsed = new DOMParser().parseFromString(
      await res.text(),
      "text/html",
    );
    harden(parsed.body);
    replaceUnsendableImages(parsed.body);
    body.append(...Array.from(parsed.body.childNodes));
    // An email that paints its own backgrounds: the editor keeps it on a light
    // scheme in the dark theme (editor.tsx).
    if (body.querySelector("[bgcolor],[style*=background]"))
      body.setAttribute("data-quote", "styled");
  } catch {
    body.textContent = message.preview;
  }

  if (mode === "forward") {
    const header = doc.createElement("div");
    header.setAttribute("style", "margin-top:0.75em");
    const lines = [
      "---------- Forwarded message ----------",
      `From: ${sender ? person(sender) : "unknown sender"}`,
      `Date: ${when}`,
      `Subject: ${message.subject ?? "(no subject)"}`,
      `To: ${people(message.to)}`,
    ];
    lines.forEach((line, index) => {
      if (index > 0) header.append(doc.createElement("br"));
      header.append(doc.createTextNode(line));
    });
    const spacer = doc.createElement("div");
    spacer.append(doc.createElement("br"));
    return `<div><br></div>${header.outerHTML}${spacer.outerHTML}${body.outerHTML}`;
  }

  const attribution = doc.createElement("div");
  attribution.setAttribute("style", "margin-top:0.75em");
  attribution.textContent = `On ${when}, ${sender?.name || sender?.email || "someone"} wrote:`;
  return `<div><br></div>${attribution.outerHTML}${body.outerHTML}`;
};

/** Plain-text alternative for what the editor holds. */
export const toPlainText = (root: Node): string => {
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return (node.textContent ?? "").replace(/\s+/g, " ");
    const el = node as HTMLElement;
    if (!el.tagName) return "";
    if (el.tagName === "BR") return "\n";
    const inner = Array.from(el.childNodes).map(render).join("");
    switch (el.tagName) {
      case "A": {
        const href = el.getAttribute("href") ?? "";
        return href && href.replace(/^mailto:/i, "") !== inner.trim()
          ? `${inner} <${href}>`
          : inner;
      }
      case "LI": {
        const list = el.parentElement;
        const marker =
          list?.tagName === "OL"
            ? `${Array.from(list.children).indexOf(el) + 1}. `
            : "- ";
        return `${marker}${inner.trim()}\n`;
      }
      case "BLOCKQUOTE":
        return `${inner
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n`;
      case "TD":
      case "TH":
        return `${inner}\t`;
      default:
        return BLOCK.test(el.tagName) ? `${inner}\n` : inner;
    }
  };

  return render(root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
