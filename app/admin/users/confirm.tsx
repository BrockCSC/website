"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Consequence } from "./api";

export type ConfirmItem = Omit<Consequence, "group"> & { fixed?: boolean };

export default function Confirm({
  title,
  intro,
  items,
  confirmLabel,
  onCancel,
  onApply,
}: {
  title: string;
  intro: string;
  items: ConfirmItem[];
  confirmLabel: string;
  onCancel: () => void;
  onApply: (ids: string[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>(
    items.filter((item) => !item.blocked).map((item) => item.id),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );

  return (
    <div className="animate-rise-in rounded-[10px] border-2 border-line bg-raised p-4">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-ink">
        {title}
      </h3>
      <p className="mt-1 text-sm text-subtle">{intro}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => {
          const locked = !!item.blocked || item.fixed;
          return (
            <li key={item.id}>
              <label
                className={`flex items-start gap-3 rounded-[10px] border-2 border-line bg-surface p-3 ${
                  item.blocked ? "opacity-55" : ""
                }`}
              >
                <input
                  checked={chosen.includes(item.id)}
                  className="mt-1 size-4 shrink-0 accent-current"
                  disabled={locked}
                  onChange={() => toggle(item.id)}
                  type="checkbox"
                />
                <span className="min-w-0 text-sm">
                  <span className="block font-bold text-ink">{item.title}</span>
                  <span className="block text-subtle">{item.detail}</span>
                  {item.blocked && (
                    <span className="mt-1 block font-bold text-brand">
                      {item.blocked}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !chosen.length}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(chosen);
            } finally {
              setBusy(false);
            }
          }}
          size="sm"
          type="button"
          variant="primary"
        >
          {busy ? "Working..." : `${confirmLabel} (${chosen.length})`}
        </Button>
        <Button
          disabled={busy}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
