import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  generateTemplateDocx,
  generateTemplatePdf,
} from "@/lib/documents/template-files";
import { findDocumentTemplate } from "@/lib/documents/templates";
import { notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

/** Node's Buffer/Uint8Array types carry a wider ArrayBufferLike than the DOM
 * body types accept — go through a Readable the same way the on-disk file
 * routes do, rather than fight that generic. Readable.from() only treats an
 * actual Buffer as a single chunk; a plain Uint8Array (what pdf-lib's
 * doc.save() returns) is iterable, so it gets pushed byte-by-byte and the
 * web ReadableStream adapter rejects each raw number — wrap in Buffer.from
 * so both producers behave the same way. */
const bytesToBody = (bytes: Uint8Array) =>
  Readable.toWeb(
    Readable.from(Buffer.from(bytes)),
  ) as ReadableStream<Uint8Array>;

/**
 * A blank branded form generated on the fly from lib/documents/templates.ts
 * — never stored, never a document_version, never gated by approval. Same
 * guard as the templates page it's downloaded from (`user?.isExecutive`,
 * which is `requireAdmin` server-side).
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();

  const limited = rateLimit(
    req,
    "documents-templates-download",
    60,
    60 * 60 * 1000,
    user.sub,
  );
  if (limited) return limited;

  const { id } = await params;
  const template = findDocumentTemplate(id);
  if (!template) return notFound();

  const format = req.nextUrl.searchParams.get("format");
  if (format !== "docx" && format !== "pdf") {
    return NextResponse.json(
      { error: "format must be docx or pdf." },
      { status: 400 },
    );
  }

  const headers = {
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
  };

  if (format === "docx") {
    const buffer = await generateTemplateDocx(template);
    return new NextResponse(bytesToBody(buffer), {
      headers: {
        ...headers,
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="BrockCSC - ${template.name}.docx"`,
      },
    });
  }

  const bytes = await generateTemplatePdf(template);
  return new NextResponse(bytesToBody(bytes), {
    headers: {
      ...headers,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="BrockCSC - ${template.name}.pdf"`,
    },
  });
};
