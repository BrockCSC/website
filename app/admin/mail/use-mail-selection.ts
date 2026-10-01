"use client";

import { useCallback, useState } from "react";
import { announce } from "@/lib/announce";
import { useCloseWatcher } from "@/lib/use-close-watcher";

// The checked rows of the mail list. On desk they are the row checkboxes and
// the BulkActions bar; on phones (spec D14) tapping a row's avatar enters
// selection mode, where row taps toggle, the top bar reads "N selected" and a
// BottomToolbar holds the bulk actions. Selection mode is not in history:
// Android back leaves it through a CloseWatcher.

export type MailSelection = {
  checked: ReadonlySet<string>;
  /** Phone selection mode: something is checked on a phone. */
  selecting: boolean;
  toggle: (id: string, on?: boolean) => void;
  setAll: (ids: string[] | null) => void;
  clear: () => void;
};

export function useMailSelection(phone: boolean): MailSelection {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const selecting = phone && checked.size > 0;

  const clear = useCallback(() => setChecked(new Set()), []);

  const toggle = useCallback(
    (id: string, on?: boolean) => {
      const next = new Set(checked);
      const add = on ?? !next.has(id);
      if (add) next.add(id);
      else next.delete(id);
      if (phone && checked.size === 0 && next.size > 0) {
        announce(
          `Selection mode. ${next.size} selected. Actions are in the toolbar at the bottom.`,
        );
      }
      setChecked(next);
    },
    [checked, phone],
  );

  const setAll = useCallback(
    (ids: string[] | null) => setChecked(new Set(ids ?? [])),
    [],
  );

  useCloseWatcher(selecting, clear);

  return { checked, selecting, toggle, setAll, clear };
}
