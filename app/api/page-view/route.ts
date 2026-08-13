import { NextResponse, type NextRequest } from "next/server";
import { create } from "@/lib/db/repository";
import { pageViewsTable } from "@/lib/db/schema";

/** Admin traffic is the club's own work, so it is not a visit to the website. */
const isPublicPath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  path.length <= 200 &&
  !path.startsWith("/admin");

export const POST = async (req: NextRequest) => {
  const body: unknown = await req.json().catch(() => null);
  const path = (body as { path?: unknown } | null)?.path;
  if (isPublicPath(path)) {
    await create(pageViewsTable, { path });
  }
  return new NextResponse(null, { status: 204 });
};
