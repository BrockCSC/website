"use client";

import { usePhone } from "@/lib/use-media-query";

/**
 * An on/off setting. Phones get a settings-style row with a trailing switch
 * and a line saying when it applies (the page mixes instant toggles with
 * ones that wait for Save). Desk keeps the leading checkbox it always had.
 */
export function SettingToggle({
  checked,
  onChange,
  disabled,
  title,
  detail,
  applies,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title: React.ReactNode;
  detail: React.ReactNode;
  /** "Takes effect immediately" or "Saved with your profile". */
  applies: string;
}) {
  const phone = usePhone();

  if (phone) {
    return (
      <label className="flex min-h-11 cursor-pointer items-center gap-3 has-disabled:cursor-default">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">{title}</span>
          <span className="mt-0.5 block text-sm text-subtle">{detail}</span>
          <span className="mt-1.5 block text-xs font-bold tracking-wide text-subtle uppercase">
            {applies}
          </span>
        </span>
        <input
          checked={checked}
          className="switch"
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          role="switch"
          type="checkbox"
        />
      </label>
    );
  }

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        checked={checked}
        className="check mt-0.5"
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      <span>
        <span className="font-bold text-ink">{title}</span>
        <span className="block text-subtle">{detail}</span>
      </span>
    </label>
  );
}
