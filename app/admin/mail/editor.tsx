"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { PHONE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { FormatBar, type Formatting } from "./format-bar";
import { harden } from "./html";

/** Content that counts even without text (a lone image, an empty list). */
const SOLID = "img,li,blockquote,table,hr,a[href]";

/** Matches the data-[empty]:before:content placeholder below. */
const PLACEHOLDER = "Write your message…";

const isEmpty = (el: HTMLElement) =>
  !el.textContent?.trim() && el.querySelector(SOLID) === null;

/** The placeholder reads `data-empty`, which (unlike :empty) survives a leftover <br>. */
export const syncEmpty = (el: HTMLElement) =>
  el.toggleAttribute("data-empty", isEmpty(el));

const caretAtStart = (el: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let start: Node = el;
  while (start.firstChild && start.firstChild.nodeType === Node.ELEMENT_NODE)
    start = start.firstChild;
  range.setStart(start, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * Puts a reply/forward quote into the editor once it has been built. An
 * untouched body takes it whole (caret back at the top); otherwise it goes
 * after what the user already wrote, leaving their caret alone.
 */
export const insertQuote = (el: HTMLElement, html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  harden(template.content);
  if (isEmpty(el)) {
    el.replaceChildren(template.content);
    if (document.activeElement === el) caretAtStart(el);
  } else {
    el.append(template.content);
  }
  syncEmpty(el);
};

/** Places the caret at the top of the body (a reply types above the quote). */
export const focusBodyStart = (el: HTMLElement) => {
  if (document.activeElement !== el) el.focus({ preventScroll: true });
  caretAtStart(el);
};

export function Editor({
  editorRef,
  initialHtml,
  formatting,
  quoting = false,
  onInput,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  /** The body at mount. Never pass live state: a re-render would wipe typing. */
  initialHtml: string;
  formatting: Formatting;
  /** The quote is still being built: show a skeleton where it will go. */
  quoting?: boolean;
  onInput?: () => void;
}) {
  const { syncActive, clearActive, addLink } = formatting;

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    harden(el);
    syncEmpty(el);
  }, [editorRef]);

  // A keyboard shortcut that opens compose (desk "r") moves focus here inside
  // its keydown, and the browser then types that key into the body. Drop text
  // input that arrives right after mount without a keydown of its own.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const mountedAt = performance.now();
    let keyed = false;
    const onKey = () => {
      keyed = true;
    };
    const onBeforeInput = (event: InputEvent) => {
      if (
        !keyed &&
        event.inputType === "insertText" &&
        performance.now() - mountedAt < 150
      )
        event.preventDefault();
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("beforeinput", onBeforeInput);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("beforeinput", onBeforeInput);
    };
  }, [editorRef]);

  // Phones: the sheet body is the only scroller, and iOS doesn't always keep
  // the caret above the docked FormatBar. Nudge the body when it falls below.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const reveal = () => {
      if (document.activeElement !== el || !mediaMatches(PHONE_QUERY)) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.endContainer)) return;
      let rect = range.getBoundingClientRect();
      if (rect.height === 0 && rect.top === 0) {
        const node = range.endContainer;
        const box = node instanceof Element ? node : node.parentElement;
        if (!box) return;
        rect = box.getBoundingClientRect();
      }
      const scroller = el.closest<HTMLElement>("[data-scroll-allow]");
      if (!scroller) return;
      const view = scroller.getBoundingClientRect();
      const below = rect.bottom - (view.bottom - 12);
      if (below > 0) scroller.scrollBy({ top: below + 12 });
      else if (rect.top < view.top)
        scroller.scrollBy({ top: rect.top - view.top - 12 });
    };
    // The keyboard rising shrinks the sheet (--vv-h) under the caret.
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => requestAnimationFrame(reveal));
    };
    const vv = window.visualViewport;
    el.addEventListener("input", reveal);
    document.addEventListener("selectionchange", reveal);
    vv?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("input", reveal);
      document.removeEventListener("selectionchange", reveal);
      vv?.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, [editorRef]);

  /** Shift+Enter is a soft break within the same paragraph, matching
   *  Gmail/Outlook; plain Enter keeps the browser's own new-paragraph
   *  and list handling. Cmd/Ctrl-K inserts a link (not the palette). */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key.toLowerCase() === "k" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void addLink();
      return;
    }
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    document.execCommand("insertLineBreak");
  };

  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-line transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand phone:overflow-x-clip phone:overflow-y-visible phone:rounded-none phone:border-0">
      <FormatBar variant="inline" formatting={formatting} />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        // The visible placeholder is CSS content, which screen readers skip.
        aria-placeholder={quoting ? undefined : PLACEHOLDER}
        aria-busy={quoting || undefined}
        onKeyDown={onKeyDown}
        onKeyUp={syncActive}
        onMouseUp={syncActive}
        onFocus={syncActive}
        onBlur={clearActive}
        onInput={(event) => {
          syncEmpty(event.currentTarget);
          onInput?.();
        }}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        className={cn(
          // Words only break when one can't fit its line; links (long URLs) anywhere.
          "max-h-[45vh] overflow-y-auto px-3 py-2 wrap-break-word focus:outline-none [&_a]:wrap-anywhere",
          quoting ? "min-h-20" : "min-h-64",
          "phone:max-h-none phone:overflow-visible phone:px-4 phone:py-3",
          quoting ? "phone:min-h-16" : "phone:min-h-[40dvh]",
          // Placeholder: shown while the body holds nothing (not while a quote loads).
          !quoting &&
            "data-[empty]:before:text-subtle data-[empty]:before:content-['Write_your_message…']",
          "[&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
          // Quoted mail brings fixed-width tables, nowrap cells and big
          // images: fit them to the editor. The sent HTML is unchanged.
          "[&_*]:!max-w-full [&_*]:!min-w-0 [&_img]:!h-auto [&_pre]:whitespace-pre-wrap [&_table]:!w-auto [&_td]:!w-auto [&_td]:!whitespace-normal [&_th]:!w-auto [&_th]:!whitespace-normal [&_[style*=nowrap]]:!whitespace-normal",
          // Words don't break mid-word, so a table can't shrink below its
          // longest words plus cell padding. Newsletters pad cells 24-32px
          // a side, which alone pushes a 4-column table past a phone's width.
          "phone:[&_td]:!px-2 phone:[&_th]:!px-2",
          // Padded "button" links wrap as one box (not overlapping lines),
          // between words, with a phone-sized side padding.
          "phone:[&_a[style*=padding]]:inline-block phone:[&_a[style*=padding]]:!px-3 phone:[&_a[style*=padding]]:wrap-break-word",
          // Dark theme: a quoted email that paints its own backgrounds keeps
          // its light scheme, or its unstyled text would inherit the light
          // ink and vanish on its own white blocks (buildQuote marks it).
          // Its plain links take the light theme's brand colour too.
          "dark:[&_[data-quote=styled]]:bg-white dark:[&_[data-quote=styled]]:text-[#1f1f1f] dark:[&_[data-quote=styled]]:[color-scheme:light] dark:[&_[data-quote=styled]_a]:text-[#9a4440]",
        )}
      />
      {quoting && (
        <div
          role="status"
          className="space-y-2 border-t-2 border-dashed border-line/30 px-3 py-3 phone:px-4"
        >
          <p className="text-sm font-bold text-subtle">
            Loading original message…
          </p>
          <div aria-hidden className="space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-tint" />
            <div className="h-3 w-full animate-pulse rounded-full bg-tint" />
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-tint" />
          </div>
        </div>
      )}
    </div>
  );
}
