"use client";

import { Button } from "@/components/ui/button";
import type { SigningFieldType } from "@/lib/api/types";
import {
  SIGNING_FIELD_DEFAULT_LABEL,
  SIGNING_FIELD_TYPES,
} from "@/lib/documents/fields";
import { FIELD_ICON } from "./field-chip";

export type PlacementSigner = { id: string; label: string; color: string };

export function SignerSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-full border-2 border-line"
      style={{ backgroundColor: color }}
    />
  );
}

const heading =
  "mb-2 block text-xs font-extrabold tracking-wide text-subtle uppercase";

export function SignerPicker({
  signers,
  value,
  onChange,
}: {
  signers: PlacementSigner[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <span className={heading} id="placement-signer">
        Signer
      </span>
      <div
        aria-labelledby="placement-signer"
        className="flex flex-wrap gap-2 lg:flex-col"
        role="radiogroup"
      >
        {signers.map((s) => (
          <Button
            aria-checked={value === s.id}
            className="max-w-full justify-start"
            key={s.id}
            onClick={() => onChange(s.id)}
            role="radio"
            size="sm"
            type="button"
            variant={value === s.id ? "primary" : "outline"}
          >
            <SignerSwatch color={s.color} />
            <span className="truncate">{s.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function FieldTypePicker({
  value,
  onChange,
}: {
  value: SigningFieldType;
  onChange: (type: SigningFieldType) => void;
}) {
  return (
    <div>
      <span className={heading} id="placement-field-type">
        Field
      </span>
      <div
        aria-labelledby="placement-field-type"
        className="flex flex-wrap gap-2 lg:flex-col"
        role="radiogroup"
      >
        {SIGNING_FIELD_TYPES.map((option) => {
          const Icon = FIELD_ICON[option.value];
          return (
            <Button
              aria-checked={value === option.value}
              className="justify-start"
              key={option.value}
              onClick={() => onChange(option.value)}
              role="radio"
              size="sm"
              type="button"
              variant={value === option.value ? "primary" : "outline"}
            >
              <Icon aria-hidden />
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function FieldLegend({
  signers,
  fields,
}: {
  signers: PlacementSigner[];
  fields: { signerId: string; type: SigningFieldType }[];
}) {
  return (
    <div>
      <span className={heading} id="placement-legend">
        Placed fields
      </span>
      <ul aria-labelledby="placement-legend" className="flex flex-col gap-2">
        {signers.map((s) => {
          const mine = fields.filter((f) => f.signerId === s.id);
          const counts = SIGNING_FIELD_TYPES.map(({ value }) => ({
            type: value,
            count: mine.filter((f) => f.type === value).length,
          })).filter((c) => c.count);
          return (
            <li className="flex min-w-0 items-start gap-2 text-xs" key={s.id}>
              <span className="mt-0.5">
                <SignerSwatch color={s.color} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink">
                  {s.label}
                </span>
                <span className="block text-subtle">
                  {mine.length
                    ? counts
                        .map(
                          (c) =>
                            `${c.count} ${SIGNING_FIELD_DEFAULT_LABEL[c.type]}`,
                        )
                        .join(", ")
                    : "No fields yet"}
                </span>
                {!mine.some((f) => f.type === "signature") && (
                  <span className="block font-bold text-destructive">
                    Needs a Signature field
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
