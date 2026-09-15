import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import type {
  DocumentVersionRecord,
  SigningRequestRecord,
} from "@/lib/api/types";
import { requireAdmin, requireMember } from "@/lib/auth/session";
import { findById } from "@/lib/db/repository";
import { documentVersionsTable, signingRequestsTable } from "@/lib/db/schema";
import { versionReadableByMemberSigner } from "@/lib/documents/access";
import { buildCombinedPdf } from "@/lib/documents/combined-pdf";
import { completedVersionIds } from "@/lib/documents/envelope";
import { readDocumentBytes } from "@/lib/documents/storage";
import { notAuthorized, notFound } from "@/lib/json";

/** Readable.from() pushes a plain Uint8Array byte by byte; a Buffer goes as one chunk. */
const bytesToBody = (bytes: Uint8Array) =>
  Readable.toWeb(
    Readable.from(Buffer.from(bytes)),
  ) as ReadableStream<Uint8Array>;

/**
 * A signed document with its Certificate of Completion appended, merged on
 * the fly (nothing extra is stored). Execs, or an internal member signer
 * scoped the same way as app/api/documents/files/[versionId]/route.ts.
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    id,
  );
  if (!request) return notFound();

  const ids = completedVersionIds(request);
  if (!ids || !request.certificateVersionId) return notFound();

  const admin = await requireAdmin(req);
  if (!admin) {
    const member = await requireMember(req);
    const allowed =
      !!member && (await versionReadableByMemberSigner(member.sub, ids.signed));
    if (!allowed) return notAuthorized();
  }

  const [signed, certificate] = await Promise.all([
    findById<DocumentVersionRecord>(documentVersionsTable, ids.signed),
    findById<DocumentVersionRecord>(documentVersionsTable, ids.certificate),
  ]);
  if (
    !signed ||
    !certificate ||
    signed.contentType !== "application/pdf" ||
    certificate.contentType !== "application/pdf"
  ) {
    return notFound();
  }

  try {
    const combined = await buildCombinedPdf(
      await Promise.all([
        readDocumentBytes(signed.storedFilename),
        readDocumentBytes(certificate.storedFilename),
      ]),
    );
    return new NextResponse(bytesToBody(combined), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(combined.byteLength),
        "content-disposition": `attachment; filename="${encodeURIComponent(`${request.title} - signed with certificate.pdf`)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return notFound();
  }
};
