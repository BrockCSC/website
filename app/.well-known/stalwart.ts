import { NextResponse } from "next/server";
import { notFound } from "@/lib/json";

/** Stalwart publishes autodiscovery on its internal port only, so we front it. */
export const fromStalwart = async (path: string): Promise<Response> => {
  const base = process.env.STALWART_URL?.replace(/\/$/, "");
  const res = base
    ? await fetch(`${base}${path}`, { cache: "no-store" }).catch(() => null)
    : null;
  if (!res?.ok) return notFound();
  return new NextResponse(await res.text(), {
    headers: {
      "content-type": res.headers.get("content-type") ?? "text/plain",
      "cache-control": "public, max-age=3600",
    },
  });
};
