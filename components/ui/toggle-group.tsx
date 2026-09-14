"use client";

import { Button } from "@/components/ui/button";

export type ToggleOption<T extends string> = { value: T; label: string };

/**
 * The "styled row of toggle buttons" this feature reaches for wherever a
 * single choice would otherwise be native radio inputs — picking a template,
 * a field type, or (below) the signing order — matching Button's own
 * variants rather than the browser's default control.
 */
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ToggleOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div aria-label={label} className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((opt) => (
        <Button
          aria-checked={value === opt.value}
          key={opt.value}
          onClick={() => onChange(opt.value)}
          role="radio"
          size="sm"
          type="button"
          variant={value === opt.value ? "primary" : "outline"}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
