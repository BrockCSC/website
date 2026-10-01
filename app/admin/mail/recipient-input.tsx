"use client";

import { X } from "lucide-react";
import { useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { COARSE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export type Contact = { name: string; email: string };

/** Imperative handle (pass `ref`): commit the pending text, focus the field. */
export type RecipientInputHandle = {
  /** Commits the draft, or the highlighted suggestion when one was chosen, and returns the new list. */
  commit(): string[];
  focus(): void;
};

type RecipientInputProps = {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  contacts: Contact[];
  autoFocus?: boolean;
  /** Offers every choice as soon as the field is focused. */
  browse?: boolean;
  placeholder?: string;
  empty?: string;
  /** 'address' (default) or 'local': bare local parts (alias forms). */
  kind?: "address" | "local";
  /** Default: 'email' for addresses, else 'text'. */
  inputMode?: "email" | "text";
  /** Chips that fail render as invalid. */
  validate?: (value: string) => boolean;
  /** Chip label (e.g. a name). The title and remove label keep the address. */
  display?: (email: string) => string;
  /** Return with an empty draft (compose: move to the next field). */
  onEnterEmpty?: () => void;
  /** Default true: on phones the suggestions render in the flow as two-line rows, not a dropdown the keyboard covers. */
  inFlowSuggestionsBelowMd?: boolean;
  /** The field as a whole is in error (e.g. no recipients): aria-invalid on the input. */
  invalid?: boolean;
  /** Id of the element holding the field's error, for aria-describedby. */
  describedBy?: string;
  ref?: React.Ref<RecipientInputHandle>;
};

const looksLikeAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const LOCAL_PART = /^[a-z0-9._+-]+$/i;

/** Commit separators. Never whitespace: names and pasted text contain it. */
const SEPARATORS = /[,;\n]/;

/** "Name <a@b.c>" → "a@b.c"; anything else is trimmed. */
const extract = (token: string) => {
  const bracketed = /<([^<>\s]+)>/.exec(token);
  return (bracketed ? bracketed[1] : token).trim().replace(/[,;]$/, "");
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

export function RecipientInput({
  label,
  value,
  onChange,
  contacts,
  autoFocus,
  browse,
  placeholder,
  empty,
  kind = "address",
  inputMode,
  validate,
  display,
  onEnterEmpty,
  inFlowSuggestionsBelowMd = true,
  invalid: fieldInvalid,
  describedBy,
  ref,
}: RecipientInputProps) {
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  // Enter/Tab pick a suggestion only after typing or arrowing, so Return in
  // an empty browse field never adds the first person (or submits a form).
  const [navigated, setNavigated] = useState(false);
  // Escape hides the suggestions until the next keystroke.
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const unpicked = useMemo(
    () =>
      contacts.filter(
        (contact) => !value.some((item) => same(item, contact.email)),
      ),
    [contacts, value],
  );

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query) return browse && focused ? unpicked.slice(0, 50) : [];
    return unpicked
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query),
      )
      .slice(0, 50);
  }, [draft, unpicked, browse, focused]);

  const showList = suggestions.length > 0 && !dismissed;
  const nothingLeft =
    browse && focused && !draft.trim() && unpicked.length === 0 && !dismissed;
  const chosen =
    showList && (draft.trim() !== "" || navigated)
      ? suggestions[highlight]
      : undefined;

  /** Adds each token (deduped, case-insensitively) and returns the new list. */
  const addMany = (tokens: string[]) => {
    const next = [...value];
    for (const token of tokens) {
      const email = extract(token);
      if (email && !next.some((item) => same(item, email))) next.push(email);
    }
    if (next.length !== value.length) onChange(next);
    return next;
  };

  const reset = (nextDraft = "") => {
    setDraft(nextDraft);
    setHighlight(0);
    setNavigated(false);
  };

  const add = (email: string) => {
    const next = addMany([email]);
    reset();
    return next;
  };

  const commit = () => {
    if (chosen) return add(chosen.email);
    if (draft.trim()) return add(draft);
    return value;
  };

  useImperativeHandle(ref, () => ({
    commit,
    focus: () => inputRef.current?.focus(),
  }));

  /** Splits text on separators: every complete token is committed, the last stays as the draft. */
  const tokenise = (text: string, finalise: (last: string) => string) => {
    const parts = text.split(SEPARATORS);
    const last = parts.pop() ?? "";
    addMany(parts);
    reset(finalise(last));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && showList) {
      event.preventDefault();
      setNavigated(true);
      setHighlight((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && showList) {
      event.preventDefault();
      setNavigated(true);
      setHighlight(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === "Escape" && (showList || nothingLeft)) {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      return;
    }
    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      // Never submits the enclosing form.
      event.preventDefault();
      if (chosen) add(chosen.email);
      else if (draft.trim()) add(draft);
      else if (onEnterEmpty) onEnterEmpty();
      else if (mediaMatches(COARSE_QUERY)) inputRef.current?.blur();
      return;
    }
    if (["Tab", ",", ";"].includes(event.key)) {
      if (chosen || draft.trim()) {
        event.preventDefault();
        add(chosen ? chosen.email : draft);
      }
      return;
    }
    if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const invalid = (email: string) => (validate ? !validate(email) : false);
  const anyInvalid = validate ? value.some((email) => !validate(email)) : false;

  const listClass = cn(
    "z-10 mt-1 max-h-56 w-full animate-fade-in overflow-y-auto overscroll-contain rounded-[10px] border-2 border-line bg-surface shadow-brut-sm",
    inFlowSuggestionsBelowMd
      ? "absolute phone:static phone:max-h-[19rem] phone:shadow-none"
      : "absolute",
  );

  return (
    <div className="relative min-w-0">
      {/* A div, never a label: it holds the chips' remove buttons. */}
      <div
        onMouseDown={(event) => {
          // Keep focus in the field when the bare wrapper is pressed.
          if (event.target === event.currentTarget) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
        className="flex cursor-text flex-wrap items-center gap-1.5 rounded-[10px] border-2 border-[var(--line-strong)] px-2 py-1.5 transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand"
      >
        <label
          htmlFor={inputId}
          className="cursor-text px-1 text-sm font-bold text-subtle"
        >
          {label}
        </label>
        {value.map((email) => {
          const bad = invalid(email);
          return (
            <span
              key={email}
              title={email}
              className={cn(
                "flex max-w-full min-w-0 animate-pop-in items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-brand",
                bad &&
                  "bg-destructive/10 text-destructive ring-2 ring-destructive ring-inset",
              )}
            >
              {bad && <span aria-hidden>!</span>}
              {/* Phones cap the label: a nowrap label's min-content is the whole
                  address, and a parent flex item without min-w-0 (compose's
                  To row) can't shrink below it, so the row would pan sideways.
                  100vw-12rem fits beside compose's Cc button down to 360px. */}
              <span className="truncate phone:max-w-[calc(100vw-12rem)]">
                {display ? display(email) : email}
              </span>
              {bad && <span className="sr-only"> (not a valid address)</span>}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => onChange(value.filter((item) => item !== email))}
                // Touch: a 32px button whose hit area grows up and down. The
                // negative side margins (22px) keep its layout width at the
                // old "×" footprint, so a long address never widens the chip
                // (and the compose row) beyond what desktop measures.
                className={cn(
                  "shrink-0 pointer-coarse:relative pointer-coarse:-my-1.5 pointer-coarse:-mr-3.5 pointer-coarse:-ml-2 pointer-coarse:grid pointer-coarse:size-8 pointer-coarse:place-items-center pointer-coarse:rounded-full pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-['']",
                  bad
                    ? "text-destructive/70 hover:text-destructive"
                    : "text-brand/70 hover:text-brand",
                )}
              >
                <span aria-hidden className="pointer-coarse:hidden">
                  ×
                </span>
                <X
                  aria-hidden
                  size={14}
                  className="hidden pointer-coarse:block"
                />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={chosen ? optionId(highlight) : undefined}
          aria-invalid={anyInvalid || fieldInvalid || undefined}
          aria-describedby={describedBy}
          className="min-w-40 flex-1 px-1 py-0.5 text-base focus:outline-none pointer-fine:text-sm phone:min-h-11 phone:min-w-24"
          value={draft}
          autoFocus={autoFocus}
          inputMode={inputMode ?? (kind === "address" ? "email" : "text")}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(event) => {
            const text = event.target.value;
            setDismissed(false);
            if (SEPARATORS.test(text))
              tokenise(text, (last) => last.trimStart());
            else reset(text);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!SEPARATORS.test(pasted) && !/<[^<>]+>/.test(pasted)) return;
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart ?? draft.length;
            const end = input.selectionEnd ?? draft.length;
            setDismissed(false);
            tokenise(
              draft.slice(0, start) + pasted + draft.slice(end),
              extract,
            );
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const text = draft.trim();
            if (
              kind === "local" ? LOCAL_PART.test(text) : looksLikeAddress(text)
            )
              add(text);
          }}
        />
      </div>

      {nothingLeft && empty && (
        <p
          className={cn(
            "z-10 mt-1 w-full animate-fade-in rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-sm text-subtle shadow-brut-sm",
            inFlowSuggestionsBelowMd
              ? "absolute phone:static phone:shadow-none"
              : "absolute",
          )}
        >
          {empty}
        </p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          data-scroll-allow
          className={listClass}
        >
          {suggestions.map((contact, index) => (
            <li
              key={contact.email}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault();
                add(contact.email);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={cn(
                "flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm",
                index === highlight ? "bg-tint" : "hover:bg-raised",
                inFlowSuggestionsBelowMd &&
                  "phone:min-h-14 phone:items-center phone:justify-start",
              )}
            >
              {inFlowSuggestionsBelowMd && (
                <span
                  aria-hidden
                  className="hidden size-9 shrink-0 place-items-center rounded-full border-2 border-line bg-surface text-xs font-extrabold text-ink phone:grid"
                >
                  {initials(contact.name)}
                </span>
              )}
              <span
                className={
                  inFlowSuggestionsBelowMd
                    ? "contents phone:flex phone:min-w-0 phone:flex-1 phone:flex-col"
                    : "contents"
                }
              >
                <span className="font-bold phone:truncate">{contact.name}</span>
                <span className="text-xs text-subtle phone:truncate phone:text-sm">
                  {contact.email}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
