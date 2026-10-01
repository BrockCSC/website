"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Bold,
  ChevronLeft,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link2,
  Paperclip,
  RemoveFormatting,
} from "lucide-react";
import { useCloseWatcher } from "@/lib/use-close-watcher";
import { cn } from "@/lib/utils";
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

/** Plain labels for the phone row, which has no hover tooltips. */
const SHORT_TITLE: Record<string, string> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikeThrough: "Strikethrough",
};

export type Formatting = {
  /** Commands whose state is on at the caret. */
  active: ReadonlySet<string>;
  /** Runs an execCommand in the editor (formatBlock toggles back to a paragraph). */
  run: (command: string, value?: string) => void;
  /** Asks for a URL and links the selection, or inserts the URL at the caret. */
  addLink: () => Promise<void>;
  syncActive: () => void;
  clearActive: () => void;
};

/**
 * The editor and its FormatBars share this: the desk bar sits inside the
 * editor box, the phone bar docks above the keyboard.
 */
export function useFormatting(
  editorRef: RefObject<HTMLDivElement | null>,
  onChange?: () => void,
): Formatting {
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());

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

  const clearActive = useCallback(() => setActive(new Set()), []);

  const run = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncActive();
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
        inputMode: "url",
      })
    )?.trim();
    if (!url || !el) return;

    el.focus();
    if (savedRange) {
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
    } else if (selection) {
      // Nothing was selected in the editor: link at the end of the body.
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
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
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
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
    onChange?.();
  };

  return { active, run, addLink, syncActive, clearActive };
}

// ------------------------------------------------------------------ desk

const inlineButton = (active: boolean) =>
  `flex size-8 items-center justify-center rounded-[8px] border-2 border-line ${
    active ? "bg-brand text-brand-ink" : "bg-surface text-ink hover:bg-tint"
  }`;

/** The desk toolbar, inside the editor box exactly as before. */
function InlineBar({ formatting }: { formatting: Formatting }) {
  const { active, run, addLink } = formatting;

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
      className={inlineButton(active.has(command))}
    >
      <Icon size={15} aria-hidden />
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-line bg-tint px-2 py-1.5 phone:hidden">
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
        className={inlineButton(false)}
      >
        <Link2 size={15} aria-hidden />
      </button>
      <button
        type="button"
        title="Clear formatting"
        aria-label="Clear formatting"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run("removeFormat")}
        className={inlineButton(false)}
      >
        <RemoveFormatting size={15} aria-hidden />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ phone

const phoneButton = (pressed = false) =>
  cn(
    "grid size-11 shrink-0 touch-manipulation place-items-center rounded-[10px] text-ink",
    pressed ? "bg-ink text-surface" : "active:bg-tint",
  );

/**
 * The phone bar: the sheet's last flex child, so it sits right above the
 * keyboard. Attach, Aa (swaps the row to the text styles), Link, Clear.
 */
function PhoneBar({
  formatting,
  onAttach,
  attachLabel,
}: {
  formatting: Formatting;
  onAttach: (files: FileList | null) => void;
  attachLabel: string;
}) {
  const { active, run, addLink } = formatting;
  const [styles, setStyles] = useState(false);
  const closeStyles = useCallback(() => setStyles(false), []);
  // Android back returns to the main row before it closes compose.
  useCloseWatcher(styles, closeStyles);

  const keep = (event: React.MouseEvent) => event.preventDefault();

  // The row swaps under a keyboard user's focus: land on its first button.
  const barRef = useRef<HTMLDivElement>(null);
  const shown = useRef(styles);
  useLayoutEffect(() => {
    if (shown.current === styles) return;
    shown.current = styles;
    const lost =
      document.activeElement === document.body ||
      document.activeElement === null;
    if (lost) barRef.current?.querySelector("button")?.focus();
  }, [styles]);

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="Formatting"
      className="chrome flex shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain border-t-2 border-line bg-surface px-2 py-1 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:hidden pb-safe-kb"
    >
      {styles ? (
        <>
          <button
            type="button"
            aria-label="Back to tools"
            onMouseDown={keep}
            onClick={closeStyles}
            className={phoneButton()}
          >
            <ChevronLeft className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
          {[...FORMAT_COMMANDS, ...BLOCK_COMMANDS].map(
            ({ command, value, icon: Icon, title }) => (
              <button
                key={command + (value ?? "")}
                type="button"
                aria-label={SHORT_TITLE[command] ?? title}
                aria-pressed={active.has(command)}
                onMouseDown={keep}
                onClick={() =>
                  run(
                    command,
                    command === "formatBlock" && active.has(command)
                      ? "<p>"
                      : value,
                  )
                }
                // Eight buttons: on the narrowest phones they give up a few px each instead of scrolling.
                className={cn(
                  phoneButton(active.has(command)),
                  "min-w-10 shrink",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ),
          )}
        </>
      ) : (
        <>
          <label
            onMouseDown={keep}
            className={cn(
              phoneButton(),
              "cursor-pointer focus-within:outline-3 focus-within:outline-brand",
            )}
          >
            <Paperclip className="size-5" aria-hidden />
            <input
              type="file"
              multiple
              aria-label={attachLabel}
              className="sr-only"
              onChange={(event) => {
                onAttach(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            aria-label="Text styles"
            onMouseDown={keep}
            onClick={() => setStyles(true)}
            className={cn(phoneButton(), "text-base font-extrabold")}
          >
            <span aria-hidden>Aa</span>
          </button>
          <button
            type="button"
            aria-label="Insert link"
            onMouseDown={keep}
            onClick={() => void addLink()}
            className={phoneButton()}
          >
            <Link2 className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Clear formatting"
            onMouseDown={keep}
            onClick={() => run("removeFormat")}
            className={phoneButton()}
          >
            <RemoveFormatting className="size-5" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

export function FormatBar(
  props:
    | { variant: "inline"; formatting: Formatting }
    | {
        variant: "phone";
        formatting: Formatting;
        onAttach: (files: FileList | null) => void;
        attachLabel: string;
      },
) {
  return props.variant === "inline" ? (
    <InlineBar formatting={props.formatting} />
  ) : (
    <PhoneBar
      formatting={props.formatting}
      onAttach={props.onAttach}
      attachLabel={props.attachLabel}
    />
  );
}
