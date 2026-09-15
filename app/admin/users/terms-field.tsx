"use client";

import { X } from "lucide-react";
import { academicTerms, sortTerms } from "@/lib/execs/terms";

const chip =
  "inline-flex animate-pop-in items-center gap-1 rounded-full border-2 border-line px-2.5 py-0.5 text-xs font-bold";

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
        <ul className="flex flex-wrap gap-1.5">
          {terms.map((term, index) => (
            <li
              className={`${chip} ${index === 0 ? "bg-brand text-brand-ink" : "bg-tint text-ink"}`}
              key={term}
            >
              {term}
              {!(keepOne && terms.length === 1) && (
                <button
                  aria-label={`Remove ${term}`}
                  className="opacity-70 hover:opacity-100"
                  onClick={() => onChange(terms.filter((t) => t !== term))}
                  type="button"
                >
                  <X aria-hidden size={12} />
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
      <p className="text-xs text-subtle">
        Past executives are listed on the team page under their newest term.
      </p>
    </div>
  );
}
