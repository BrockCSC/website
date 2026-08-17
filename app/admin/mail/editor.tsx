"use client";

import { useEffect, type RefObject } from "react";
import { harden } from "./html";
import { ask } from "../ask";

const COMMANDS: [
  command: string,
  label: string,
  title: string,
  style: string,
][] = [
  ["bold", "B", "Bold", "font-black"],
  ["italic", "I", "Italic", "font-serif italic"],
  ["underline", "U", "Underline", "underline"],
  ["insertUnorderedList", "•", "Bulleted list", ""],
  ["insertOrderedList", "1.", "Numbered list", ""],
];

const BUTTON =
  "min-w-8 rounded-[8px] border-2 border-line bg-surface px-2 py-0.5 text-sm font-bold hover:bg-tint";

export function Editor({
  editorRef,
  initialHtml,
  autoFocus,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  initialHtml: string;
  autoFocus?: boolean;
}) {
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

  const run = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const addLink = async () => {
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
    run("createLink", /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`);
  };

  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-line transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand">
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-line bg-tint px-2 py-1.5">
        {COMMANDS.map(([command, label, title, style]) => (
          <button
            key={command}
            type="button"
            title={title}
            aria-label={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(command)}
            className={`${BUTTON} ${style}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void addLink()}
          className={BUTTON}
        >
          Link
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        className="max-h-[45vh] min-h-64 overflow-y-auto px-3 py-2 focus:outline-none empty:before:text-subtle empty:before:content-['Write_your_message…'] [&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
