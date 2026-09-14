import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { versionReadableByViewToken } from "@/lib/documents/access";
import { readDocumentBytes } from "@/lib/documents/storage";
import { rateLimit } from "@/lib/rate-limit";

/** Readable.from() pushes a plain Uint8Array byte by byte; a Buffer goes as one chunk. */
const bytesToBody = (bytes: Uint8Array) =>
  Readable.toWeb(
    Readable.from(Buffer.from(bytes)),
  ) as ReadableStream<Uint8Array>;

/** ?which=signed|certificate, inline, for the view token's own completed request only. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-signed-file", 60, 60 * 60 * 1000);
  if (limited) return limited;

  const which = req.nextUrl.searchParams.get("which");
  if (which !== "signed" && which !== "certificate") {
    return NextResponse.json(
      { error: "which must be signed or certificate." },
      { status: 400 },
    );
  }
  const { token } = await params;
  const version = await versionReadableByViewToken(token, which);
  if (!version) return new NextResponse(null, { status: 404 });

  try {
    const bytes = await readDocumentBytes(version.storedFilename);
    return new NextResponse(bytesToBody(bytes), {
      headers: {
        "content-type": version.contentType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `inline; filename="${encodeURIComponent(version.originalFilename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
};
