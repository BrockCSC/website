import { NextResponse, type NextRequest } from "next/server";
import { create } from "@/lib/db/repository";
import { rateLimit } from "@/lib/rate-limit";
import { pageViewsTable } from "@/lib/db/schema";

/** Admin traffic is the club's own work, so it is not a visit to the website. */
const isPublicPath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  path.length <= 200 &&
  !path.startsWith("/admin");

export const POST = async (req: NextRequest) => {
  // The count is a vanity metric, but the table it writes to is not free.
  if (rateLimit(req, "page-view", 60, 60 * 1000)) {
    return new NextResponse(null, { status: 204 });
  }

  const body: unknown = await req.json().catch(() => null);
  const path = (body as { path?: unknown } | null)?.path;
  if (isPublicPath(path)) {
    await create(pageViewsTable, { path });
  }
  return new NextResponse(null, { status: 204 });
};
