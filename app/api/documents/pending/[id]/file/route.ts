import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import type { ReplacePayload, UploadPayload } from "@/lib/api/types";
import { hasApproverRole, requireAdmin } from "@/lib/auth/session";
import { findPendingAction } from "@/lib/documents/pending";
import { documentFilePath } from "@/lib/documents/storage";
import { notAuthorized, notFound } from "@/lib/json";

/** So an approver can see what they're approving; the proposer may see their own submission too. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();

  const { id } = await params;
  const pending = await findPendingAction(id);
  if (!pending || (pending.kind !== "upload" && pending.kind !== "replace")) {
    return notFound();
  }
  if (!hasApproverRole(user) && pending.proposedBy !== user.sub)
    return notAuthorized();

  const payload = pending.payload as UploadPayload | ReplacePayload;
  const resolved = documentFilePath(payload.storedFilename);
  if (!resolved) return notFound();

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return notFound();
    const stream = Readable.toWeb(
      createReadStream(resolved),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "content-type": payload.contentType,
        "content-length": String(info.size),
        "content-disposition": `inline; filename="${encodeURIComponent(payload.originalFilename)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return notFound();
  }
};
