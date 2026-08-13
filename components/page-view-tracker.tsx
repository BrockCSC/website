"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordPageView } from "@/lib/api";

/**
 * Records one view per rendered path. Only the path and a timestamp are stored,
 * and a view that fails to record is simply lost rather than shown to the user.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordPageView(pathname).catch(() => {});
  }, [pathname]);

  return null;
}
