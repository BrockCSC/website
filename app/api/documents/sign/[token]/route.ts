import { NextResponse, type NextRequest } from "next/server";
import type { DocumentRecord, DocumentVersionRecord } from "@/lib/api/types";
import { findById } from "@/lib/db/repository";
import { documentVersionsTable, documentsTable } from "@/lib/db/schema";
import {
  fieldsForSigner,
  parseFieldValuesInput,
  recordSignerResponse,
  recordSignerView,
  redactSigner,
  sanitizeCertificateText,
} from "@/lib/documents/signing";
import { findValidSignerToken } from "@/lib/documents/tokens";
import { badJson, jsonObject } from "@/lib/json";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * One generic failure for every reason a token doesn't work (unknown, expired,
 * spent, wrong status) — the same anti-enumeration discipline as
 * app/api/auth/reset-password/route.ts.
 */
const INVALID = () =>
  NextResponse.json(
    { error: "This signing link is invalid or has expired." },
    { status: 400 },
  );

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-view", 60, 60 * 60 * 1000);
  if (limited) return limited;

  const { token } = await params;
  const lookup = await findValidSignerToken(token);
  if (!lookup) return INVALID();

  const viewed = await recordSignerView(lookup.request.id, lookup.signer.id);
  const mine = viewed.signers.find((s) => s.id === lookup.signer.id)!;
  const document = await findById<DocumentRecord>(
    documentsTable,
    viewed.documentId,
  );
  const version = await findById<DocumentVersionRecord>(
    documentVersionsTable,
    viewed.sourceVersionId,
  );
  const canRespond =
    viewed.status === "sent" &&
    mine.status !== "signed" &&
    mine.status !== "declined" &&
    (viewed.mode === "parallel" ||
      viewed.signers.every(
        (s) => s.order >= mine.order || s.status === "signed",
      ));

  return NextResponse.json({
    document: document ? { title: document.title } : null,
    version: version ? { contentType: version.contentType } : null,
    signingRequestTitle: viewed.title,
    signingRequestStatus: viewed.status,
    mode: viewed.mode,
    signer: redactSigner(mine),
    fields: fieldsForSigner(viewed, mine.id),
    // Ordering only, never another signer's name or email.
    otherSigners: viewed.signers
      .filter((s) => s.id !== mine.id)
      .map((s) => ({ order: s.order, status: s.status })),
    canRespond,
  });
};

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-submit", 20, 60 * 60 * 1000);
  if (limited) return limited;

  const { token } = await params;
  const lookup = await findValidSignerToken(token);
  if (!lookup) return INVALID();

  const body = await jsonObject<{
    action?: string;
    signatureText?: string;
    reason?: string;
    fieldValues?: unknown;
  }>(req);
  if (!body) return badJson();

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  try {
    if (body.action === "sign") {
      const signatureText = body.signatureText
        ? sanitizeCertificateText(body.signatureText)
        : "";
      if (!signatureText) {
        return NextResponse.json(
          { error: "Type your name to sign." },
          { status: 400 },
        );
      }
      await recordSignerResponse(lookup.request.id, lookup.signer.id, {
        action: "sign",
        signatureText,
        ip,
        userAgent,
        fieldValues: parseFieldValuesInput(body.fieldValues),
      });
      return NextResponse.json({ success: true });
    }
    if (body.action === "decline") {
      await recordSignerResponse(lookup.request.id, lookup.signer.id, {
        action: "decline",
        reason: body.reason?.trim() || undefined,
        ip,
        userAgent,
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not record your response.",
      },
      { status: 409 },
    );
  }
};
