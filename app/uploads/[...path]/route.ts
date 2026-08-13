import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { contentTypeForPath, resolveUploadPath } from "@/lib/uploads";

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;
  const resolved = resolveUploadPath(path);
  if (!resolved) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return new NextResponse(null, { status: 404 });

    const stream = Readable.toWeb(
      createReadStream(resolved),
    ) as ReadableStream<Uint8Array>;

    return new NextResponse(stream, {
      headers: {
        "content-type": contentTypeForPath(resolved),
        "content-length": String(info.size),
        // Names are random, so a file never changes under the same URL.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
};
