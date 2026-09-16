"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link2,
  RemoveFormatting,
} from "lucide-react";
import { harden } from "./html";
import { ask } from "../ask";

type Command = {
  command: string;
  value?: string;
  icon: typeof Bold;
  title: string;
};

const FORMAT_COMMANDS: Command[] = [
  { command: "bold", icon: Bold, title: "Bold (Ctrl+B)" },
  { command: "italic", icon: Italic, title: "Italic (Ctrl+I)" },
  { command: "underline", icon: Underline, title: "Underline (Ctrl+U)" },
  { command: "strikeThrough", icon: Strikethrough, title: "Strikethrough" },
];

const BLOCK_COMMANDS: Command[] = [
  { command: "insertUnorderedList", icon: List, title: "Bulleted list" },
  { command: "insertOrderedList", icon: ListOrdered, title: "Numbered list" },
  {
    command: "formatBlock",
    value: "<blockquote>",
    icon: Quote,
    title: "Quote",
  },
];

const buttonClass = (active: boolean) =>
  `flex size-8 items-center justify-center rounded-[8px] border-2 border-line ${
    active ? "bg-brand text-brand-ink" : "bg-surface text-ink hover:bg-tint"
  }`;

export function Editor({
  editorRef,
  initialHtml,
  autoFocus,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  initialHtml: string;
  autoFocus?: boolean;
}) {
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    harden(el);
    if (!autoFocus) return;
    el.focus();
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editorRef, autoFocus]);

  const syncActive = useCallback(() => {
    const el = editorRef.current;
    if (!el || document.activeElement !== el) return;
    const next = new Set<string>();
    for (const { command } of [...FORMAT_COMMANDS, ...BLOCK_COMMANDS]) {
      try {
        if (command === "formatBlock") {
          if (
            document.queryCommandValue("formatBlock").toLowerCase() ===
            "blockquote"
          )
            next.add(command);
        } else if (document.queryCommandState(command)) {
          next.add(command);
        }
      } catch {
        // Some commands throw on unsupported selections; leave inactive.
      }
    }
    setActive(next);
  }, [editorRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", syncActive);
    return () => document.removeEventListener("selectionchange", syncActive);
  }, [syncActive]);

  const run = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncActive();
  };

  /** Shift+Enter is a soft break within the same paragraph, matching
   *  Gmail/Outlook; plain Enter keeps the browser's own new-paragraph
   *  and list handling. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    document.execCommand("insertLineBreak");
  };

  const addLink = async () => {
    // The ask() dialog steals focus while awaited, and browsers don't
    // reliably restore the editor's caret/selection on refocus — save the
    // range now and restore it before acting, or createLink silently does
    // nothing.
    const el = editorRef.current;
    const selection = window.getSelection();
    const savedRange =
      selection &&
      selection.rangeCount > 0 &&
      el?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;

    const url = (
      await ask({
        title: "Insert a link",
        placeholder: "https://example.com",
        confirmLabel: "Insert",
        withInput: true,
        required: true,
      })
    )?.trim();
    if (!url) return;

    el?.focus();
    if (savedRange) {
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
    }

    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    // createLink needs selected text to turn into a link; with just a caret
    // (the common case when nothing was highlighted first), insert the URL
    // itself as the link text instead, matching Gmail/Outlook. Built as a
    // real node, not an HTML string, so a stray `"` or `<` in the typed URL
    // can't break out of the markup.
    if (savedRange && !savedRange.collapsed) {
      document.execCommand("createLink", false, href);
    } else {
      const range = window.getSelection()?.getRangeAt(0);
      if (range) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = href;
        range.deleteContents();
        range.insertNode(link);
        range.setStartAfter(link);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    syncActive();
  };

  const toolbarButton = ({ command, value, icon: Icon, title }: Command) => (
    <button
      key={command + (value ?? "")}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active.has(command)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() =>
        // formatBlock doesn't toggle itself off natively: re-running it with
        // the same tag while already a quote is a no-op, so switch back to
        // a plain paragraph instead.
        run(
          command,
          command === "formatBlock" && active.has(command) ? "<p>" : value,
        )
      }
      className={buttonClass(active.has(command))}
    >
      <Icon size={15} aria-hidden />
    </button>
  );

  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-line transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand">
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-line bg-tint px-2 py-1.5">
        {FORMAT_COMMANDS.map(toolbarButton)}
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        {BLOCK_COMMANDS.map(toolbarButton)}
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <button
          type="button"
          title="Insert link"
          aria-label="Insert link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void addLink()}
          className={buttonClass(false)}
        >
          <Link2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          title="Clear formatting"
          aria-label="Clear formatting"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run("removeFormat")}
          className={buttonClass(false)}
        >
          <RemoveFormatting size={15} aria-hidden />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        onKeyDown={onKeyDown}
        onKeyUp={syncActive}
        onMouseUp={syncActive}
        onFocus={syncActive}
        onBlur={() => setActive(new Set())}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        className="max-h-[45vh] min-h-64 overflow-y-auto px-3 py-2 focus:outline-none empty:before:text-subtle empty:before:content-['Write_your_message…'] [&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
