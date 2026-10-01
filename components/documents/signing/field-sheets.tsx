"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * Touch screens: a text field on the page is a chip; tapping it (or the
 * primary "Fill in …") opens this sheet with a 16px input outside the page's
 * scale transform, so iOS never zooms. The tap was a request to type, so the
 * input takes focus and the keyboard rises.
 */
export function TextFieldSheet({
  open,
  label,
  required,
  value,
  onCommit,
  onClose,
}: {
  open: boolean;
  label: string;
  required: boolean;
  value: string;
  /** Done or Enter: the new value. The caller closes the sheet. */
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Edited locally; Cancel, back and the backdrop leave the field as it was.
  const [draft, setDraft] = useState(value);
  const [shownFor, setShownFor] = useState({ open, value });
  if (shownFor.open !== open || (open && shownFor.value !== value)) {
    setShownFor({ open, value });
    if (open) setDraft(value);
  }

  return (
    <Sheet
      footer={
        <div className="grid grid-cols-2 gap-3 desk:flex desk:justify-end">
          <Button
            className="phone:h-12"
            onClick={onClose}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="phone:h-12"
            onClick={() => onCommit(draft)}
            size="sm"
            type="button"
          >
            Done
          </Button>
        </div>
      }
      initialFocus={input}
      onClose={onClose}
      open={open}
      description={required ? "Required" : "Optional"}
      title={label}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCommit(draft);
        }}
      >
        <label className="sr-only" htmlFor={id}>
          {label}
          {required ? " (required)" : " (optional)"}
        </label>
        <input
          aria-required={required}
          autoCapitalize="words"
          className="h-12 w-full rounded-[10px] border-2 border-[var(--line-strong)] bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-brand pointer-fine:h-10 pointer-fine:text-sm"
          enterKeyHint="next"
          id={id}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={label}
          ref={input}
          value={draft}
        />
      </form>
    </Sheet>
  );
}

/** "Details" from the phone sign bar's options: what's being signed, and the envelope ID. */
export function EnvelopeDetailsSheet({
  open,
  onClose,
  title,
  documentTitle,
  from,
  envelopeId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  documentTitle?: string;
  from?: string;
  envelopeId?: string;
}) {
  const rows: { term: string; value?: string; mono?: boolean }[] = [
    { term: "Request", value: title },
    {
      term: "Document",
      value: documentTitle && documentTitle !== title ? documentTitle : "",
    },
    { term: "From", value: from },
    { term: "Envelope ID", value: envelopeId, mono: true },
  ];
  return (
    <Sheet onClose={onClose} open={open} title="Details">
      <dl className="grid gap-3">
        {rows
          .filter((row) => row.value)
          .map((row) => (
            <div key={row.term}>
              <dt className="text-sm font-bold text-subtle">{row.term}</dt>
              <dd
                className={
                  row.mono
                    ? "font-mono text-sm wrap-anywhere text-ink"
                    : "text-base font-bold wrap-anywhere text-ink"
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
      </dl>
    </Sheet>
  );
}
