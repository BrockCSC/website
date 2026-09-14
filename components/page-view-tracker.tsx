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
    // The secret signing token lives in this path segment; recording it would
    // put it in the page_views table, and from there into analytics reports.
    if (pathname.startsWith("/sign/") || pathname.startsWith("/signed/"))
      return;
    recordPageView(pathname).catch(() => {});
  }, [pathname]);

  return null;
}
