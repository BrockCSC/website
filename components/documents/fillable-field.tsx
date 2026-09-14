"use client";

import type { SigningFieldType } from "@/lib/api/types";

/**
 * The signer's own view of one field, positioned on the rendered preview.
 * Signature fields are read-only here and mirror the signatureText typed
 * into the existing signature input elsewhere on the page — there is no
 * second, independent signature capture. Date and Text fields are plain
 * inputs whose values are collected into fieldValues on submit.
 */
export function FillableField({
  type,
  xPercent,
  yPercent,
  label,
  value,
  onChange,
  required,
}: {
  type: SigningFieldType;
  xPercent: number;
  yPercent: number;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required: boolean;
}) {
  const fieldClass =
    "w-full rounded-[8px] border-2 border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand";

  return (
    <div
      className="absolute w-[200px] max-w-[46%] -translate-x-1/2 -translate-y-1/2"
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
    >
      <p className="mb-0.5 truncate text-[10px] font-extrabold tracking-wide text-brand uppercase">
        {label}
        {required ? " *" : ""}
      </p>
      {type === "signature" ? (
        <div
          className="truncate rounded-[8px] border-2 border-brand bg-tint px-2 py-1 text-sm text-ink italic"
          title={value}
        >
          {value || "Type your name below to sign"}
        </div>
      ) : (
        <input
          className={fieldClass}
          onChange={(e) => onChange(e.target.value)}
          type={type === "date" ? "date" : "text"}
          value={value}
        />
      )}
    </div>
  );
}
