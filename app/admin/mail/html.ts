import type { MessageSummary } from "@/lib/mail/jmap-mail";

const QUOTE_STYLE =
  "margin:0 0 0 0.8ex;border-left:2px solid #ccc;padding-left:1ex";

const SAFE_URL = /^(?:https?:|mailto:|tel:|cid:|#)/i;

const BLOCK =
  /^(ADDRESS|ARTICLE|DD|DIV|DL|DT|H[1-6]|HR|OL|P|PRE|SECTION|TABLE|TR|UL)$/;

export const harden = (root: HTMLElement) => {
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

export const buildQuote = async (message: MessageSummary): Promise<string> => {
  const doc = document.implementation.createHTMLDocument("");
  const sender = message.from?.[0];
  const attribution = doc.createElement("div");
  attribution.textContent = `On ${new Date(
    message.receivedAt,
  ).toLocaleString()}, ${sender?.name || sender?.email || "someone"} wrote:`;

  const quote = doc.createElement("blockquote");
  quote.setAttribute("style", QUOTE_STYLE);
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
    quote.append(...Array.from(parsed.body.childNodes));
  } catch {
    quote.textContent = message.preview;
  }

  return `<div><br></div>${attribution.outerHTML}${quote.outerHTML}`;
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
