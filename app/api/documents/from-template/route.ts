import { NextResponse, type NextRequest } from "next/server";
import type { UploadPayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import { findDocumentTemplate } from "@/lib/documents/templates";
import { renderLetterheadDocument } from "@/lib/documents/letterhead";
import { createDocumentWithVersion } from "@/lib/documents/mutations";
import { proposeOrApply } from "@/lib/documents/pending";
import { storeDocumentBytes } from "@/lib/documents/storage";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

/** Matches the mail send caps (100KB text / 400KB HTML) documented in CONTRIBUTING.md. */
const MAX_BODY_BYTES = 400 * 1024;

type Body = {
  templateId?: string;
  category?: string;
  title?: string;
  description?: string;
  bodyHtml?: string;
};

/**
 * Starting a document from a branded template. Reuses the "upload" pending
 * kind end to end (approval queue, replay on approval, the pending file
 * preview) since a template-originated document is, once rendered, just
 * another document version — see lib/documents/letterhead.ts for the render
 * step and lib/documents/storage.ts for why text/html can't be uploaded
 * directly through the multipart routes.
 */
export const POST = async (req: NextRequest) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const limited = rateLimit(
    req,
    "documents-upload",
    30,
    60 * 60 * 1000,
    user.sub,
  );
  if (limited) return limited;

  const body = await jsonObject<Body>(req);
  if (!body) return badJson();

  const template = body.templateId
    ? findDocumentTemplate(body.templateId)
    : null;
  const category = body.category?.trim();
  const title = body.title?.trim();
  const description = body.description?.trim();
  const bodyHtml = body.bodyHtml ?? "";
  if (!template || !category || !title) {
    return NextResponse.json(
      { error: "A template, a category and a title are required." },
      { status: 400 },
    );
  }
  if (new TextEncoder().encode(bodyHtml).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "That document body is too large." },
      { status: 413 },
    );
  }

  const html = renderLetterheadDocument({
    title,
    category,
    bodyHtml,
    generatedAt: new Date(),
  });
  const bytes = new TextEncoder().encode(html);
  const { storedFilename, sha256 } = await storeDocumentBytes(
    bytes,
    "text/html",
  );
  const payload: UploadPayload = {
    category,
    title,
    description: description || undefined,
    storedFilename,
    originalFilename: `${title}.html`,
    contentType: "text/html",
    size: bytes.byteLength,
    sha256,
    note: `Created from the "${template.name}" template.`,
  };

  const outcome = await proposeOrApply(user, "upload", payload, {}, () =>
    createDocumentWithVersion({ sub: user.sub, name: user.name }, payload),
  );
  return outcome.applied
    ? NextResponse.json(toWireRecord(outcome.result.document), { status: 201 })
    : NextResponse.json(
        { pending: toWireRecord(outcome.pending) },
        { status: 202 },
      );
};
