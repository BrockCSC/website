"use client";

import { X } from "lucide-react";
import { academicTerms, sortTerms } from "@/lib/execs/terms";

// On touch the chips grow to a comfortable 36px and the remove button gets
// its own 32px box whose hit area grows vertically (plus 4px sideways), so
// it never reaches into the neighbouring chip (the RecipientInput rule).
const chip =
  "inline-flex animate-pop-in items-center gap-1 rounded-full border-2 border-line px-2.5 py-0.5 text-xs font-bold pointer-coarse:min-h-9 pointer-coarse:gap-1 pointer-coarse:px-3 pointer-coarse:py-1.5 pointer-coarse:text-sm";

const remove =
  "-m-1.5 p-1.5 opacity-70 hover:opacity-100 pointer-coarse:relative pointer-coarse:my-[-0.375rem] pointer-coarse:mr-[-0.5rem] pointer-coarse:ml-0 pointer-coarse:grid pointer-coarse:size-8 pointer-coarse:place-items-center pointer-coarse:rounded-full pointer-coarse:p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-[''] pointer-coarse:active:bg-ink/10";

/** Chips for the terms served, newest first, and a select that adds another. */
export function TermsField({
  fieldClass,
  id,
  keepOne,
  onChange,
  terms,
}: {
  /** fieldOn() for the panel's background. */
  fieldClass: string;
  id: string;
  /** A current exec keeps one term: the server puts the current one straight back. */
  keepOne: boolean;
  onChange: (terms: string[]) => void;
  terms: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {terms.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pointer-coarse:gap-2">
          {terms.map((term, index) => (
            <li
              className={`${chip} ${index === 0 ? "bg-brand text-brand-ink" : "bg-tint text-ink"}`}
              key={term}
            >
              {term}
              {!(keepOne && terms.length === 1) && (
                <button
                  aria-label={`Remove ${term}`}
                  className={remove}
                  onClick={() => onChange(terms.filter((t) => t !== term))}
                  type="button"
                >
                  <X aria-hidden className="size-3 pointer-coarse:size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <select
        className={fieldClass}
        id={id}
        onChange={(e) =>
          e.target.value && onChange(sortTerms([...terms, e.target.value]))
        }
        value=""
      >
        <option value="">
          {terms.length ? "Add another term" : "Add a term"}
        </option>
        {academicTerms()
          .filter((t) => !terms.includes(t))
          .map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
      </select>
      <p className="text-sm text-subtle pointer-fine:text-xs">
        Past executives are listed on the team page under their newest term.
      </p>
    </div>
  );
}
