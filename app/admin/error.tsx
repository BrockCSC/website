"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useTopBar } from "./chrome";
import { AdminPage } from "./page-frame";
import { sectionFor } from "./sections";

const noSubscribe = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => "";

/**
 * A screen under /admin threw. Renders inside the shell, so the header, rail
 * and tab bar stay usable around it.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The admin host rewrites / to /admin (see app/admin/layout.tsx).
  const path = pathname === "/" ? "/admin" : pathname;
  const search = useSyncExternalStore(noSubscribe, readSearch, serverSearch);
  const section = sectionFor(path);
  const target = section?.href ?? "/admin";
  const name = section?.name ?? "Home";
  useTopBar({ docTitle: name });

  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  // Next resets this boundary only when the pathname changes, so the way out
  // is a full load: it also drops a stack param (?m=, ?event=) that may be
  // what broke the screen. Pointless when it would reload this exact URL.
  const showExit = path !== target || search !== "";

  return (
    <AdminPage width="narrow">
      <div className="rounded-[20px] border-2 border-line bg-surface p-6">
        <div role="alert">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-subtle">
            Something went wrong
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink">
            This screen didn&apos;t load.
          </h1>
          <p className="mt-2 text-sm text-subtle">
            Try again. If it keeps happening, let an exec know on Discord.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button className="max-sm:w-full" onClick={retry} size="lg">
            Try again
          </Button>
          {showExit && (
            <Button
              asChild
              className="max-sm:w-full"
              size="lg"
              variant="outline"
            >
              <a href={target}>Go to {name}</a>
            </Button>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
