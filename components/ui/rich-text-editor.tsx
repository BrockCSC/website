"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolbarCommand =
  | "bold"
  | "italic"
  | "underline"
  | "h2"
  | "h3"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight";

const TOOLBAR: { key: ToolbarCommand; icon: LucideIcon; label: string }[] = [
  { key: "bold", icon: Bold, label: "Bold" },
  { key: "italic", icon: Italic, label: "Italic" },
  { key: "underline", icon: Underline, label: "Underline" },
  { key: "h2", icon: Heading1, label: "Heading" },
  { key: "h3", icon: Heading2, label: "Subheading" },
  { key: "insertUnorderedList", icon: List, label: "Bulleted list" },
  { key: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { key: "justifyLeft", icon: AlignLeft, label: "Align left" },
  { key: "justifyCenter", icon: AlignCenter, label: "Align centre" },
  { key: "justifyRight", icon: AlignRight, label: "Align right" },
];

/**
 * execCommand is deprecated but still broadly supported in every browser this
 * admin portal targets, and it is the zero-dependency way to get bold,
 * headings and lists out of a contentEditable region without pulling in a
 * rich-text framework for a body field that is otherwise plain paragraphs.
 * DOMPurify (lib/mail/sanitize.ts) has the final say server-side regardless
 * of what this produces.
 */
const format = (command: string, value?: string) =>
  document.execCommand(command, false, value);

const currentBlock = () =>
  document.queryCommandValue("formatBlock").toUpperCase();

export function RichTextEditor({
  value,
  onChange,
  resetKey,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Bump this (e.g. to the template id) to reset the editor's content from `value` again. */
  resetKey: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const appliedResetKey = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (appliedResetKey.current === resetKey) return;
    appliedResetKey.current = resetKey;
    if (ref.current) ref.current.innerHTML = value;
    // Only on mount and when resetKey changes — writing innerHTML on every
    // keystroke would reset the caret to the start of the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const refresh = () => {
      const el = ref.current;
      if (!el || document.activeElement !== el) return;
      const block = currentBlock();
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        h2: block === "H2",
        h3: block === "H3",
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
      });
    };
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, []);

  const runCommand = (command: ToolbarCommand) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (command === "h2" || command === "h3") {
      const tag = command.toUpperCase();
      format("formatBlock", currentBlock() === tag ? "P" : tag);
    } else {
      format(command);
    }
    onChange(el.innerHTML);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="toolbar">
        {TOOLBAR.map((item) => (
          <Button
            aria-label={item.label}
            aria-pressed={!!active[item.key]}
            key={item.key}
            // Keeps the text selection alive — a plain click on a button
            // blurs the editor and execCommand would have nothing to act on.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(item.key)}
            size="xs"
            title={item.label}
            type="button"
            variant={active[item.key] ? "primary" : "outline"}
          >
            <item.icon aria-hidden />
          </Button>
        ))}
      </div>
      <div
        aria-multiline="true"
        className={cn(
          "min-h-[240px] w-full rounded-[10px] border-2 border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:text-base [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
          className,
        )}
        contentEditable
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        ref={ref}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}
