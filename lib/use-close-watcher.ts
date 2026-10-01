"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Lets Android back (and Esc) exit a non-dialog mode such as selection mode,
// armed field placement or the FormatBar "Aa" row, without a history entry.
// A no-op where CloseWatcher doesn't exist (iOS, Firefox).
//
// Turn `active` on from a tap or keypress handler's commit, so Chrome gives
// the watcher its own back step. Turn it off in onClose.

type CloseWatcherLike = {
  onclose: ((event: Event) => void) | null;
  destroy(): void;
};

type CloseWatcherConstructor = new () => CloseWatcherLike;

export function useCloseWatcher(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Depends on `active` only: recreating the watcher whenever the callback's
  // identity changes would spend Chrome's one watcher per user activation.
  useEffect(() => {
    if (!active) return;
    const Watcher = (
      window as unknown as { CloseWatcher?: CloseWatcherConstructor }
    ).CloseWatcher;
    if (!Watcher) return;
    let watcher: CloseWatcherLike;
    try {
      watcher = new Watcher();
    } catch {
      return;
    }
    watcher.onclose = () => onCloseRef.current();
    return () => watcher.destroy();
  }, [active]);
}
