import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import type { DocumentVersionRecord } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById } from "@/lib/db/repository";
import { documentVersionsTable } from "@/lib/db/schema";
import { documentFilePath } from "@/lib/documents/storage";
import { notAuthorized, notFound } from "@/lib/json";

const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
]);

/**
 * Authenticated execs only — see app/api/documents/sign/[token]/file/route.ts
 * for the separate, token-scoped route external signers use. Re-checks
 * access on every request; never cached long-lived, unlike lib/uploads.ts.
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();

  const { versionId } = await params;
  const version = await findById<DocumentVersionRecord>(
    documentVersionsTable,
    versionId,
  );
  if (!version) return notFound();

  const resolved = documentFilePath(version.storedFilename);
  if (!resolved) return notFound();

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return notFound();
    const stream = Readable.toWeb(
      createReadStream(resolved),
    ) as ReadableStream<Uint8Array>;
    const disposition = INLINE_TYPES.has(version.contentType)
      ? "inline"
      : "attachment";
    return new NextResponse(stream, {
      headers: {
        "content-type": version.contentType,
        "content-length": String(info.size),
        "content-disposition": `${disposition}; filename="${encodeURIComponent(version.originalFilename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return notFound();
  }
};
