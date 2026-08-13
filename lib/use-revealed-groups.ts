"use client";

import { useMemo, useState } from "react";

type Group<T> = { items: T[] };

/**
 * Reveals whole groups at a time, never splitting one across a click, and keeps
 * going until at least `step` more items are shown. Stopping mid-term would read
 * as broken rather than paginated.
 */
export const useRevealedGroups = <T, G extends Group<T>>(
  groups: G[],
  step = 10,
) => {
  const [revealed, setRevealed] = useState(1);

  const boundaries = useMemo(() => {
    const marks: number[] = [];
    let sinceMark = 0;
    groups.forEach((group, index) => {
      sinceMark += group.items.length;
      if (sinceMark >= step || index === groups.length - 1) {
        marks.push(index + 1);
        sinceMark = 0;
      }
    });
    return marks.length ? marks : [groups.length];
  }, [groups, step]);

  const shownGroups =
    boundaries[Math.min(revealed, boundaries.length) - 1] ?? 0;
  const visible = groups.slice(0, shownGroups);
  const hidden = groups
    .slice(shownGroups)
    .reduce((total, group) => total + group.items.length, 0);

  return {
    visible,
    hidden,
    hasMore: shownGroups < groups.length,
    revealMore: () => setRevealed((n) => n + 1),
    revealAll: () => setRevealed(boundaries.length),
  };
};
