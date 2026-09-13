import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { versionReadableByToken } from "@/lib/documents/access";
import { documentFilePath } from "@/lib/documents/storage";
import { rateLimit } from "@/lib/rate-limit";

/** The only bytes a token unlocks: the exact version pinned when its request was created. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-file", 60, 60 * 60 * 1000);
  if (limited) return limited;

  const { token } = await params;
  const version = await versionReadableByToken(token);
  if (!version) return new NextResponse(null, { status: 404 });

  const resolved = documentFilePath(version.storedFilename);
  if (!resolved) return new NextResponse(null, { status: 404 });

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });
    const stream = Readable.toWeb(
      createReadStream(resolved),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "content-type": version.contentType,
        "content-length": String(info.size),
        "content-disposition": `inline; filename="${encodeURIComponent(version.originalFilename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
};
