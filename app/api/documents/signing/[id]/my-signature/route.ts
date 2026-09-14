import { NextResponse, type NextRequest } from "next/server";
import type {
  DocumentRecord,
  DocumentVersionRecord,
  SigningRequestRecord,
} from "@/lib/api/types";
import { requireMember } from "@/lib/auth/session";
import { findById } from "@/lib/db/repository";
import { findSignupByUserId } from "@/lib/db/signups";
import {
  documentVersionsTable,
  documentsTable,
  signingRequestsTable,
} from "@/lib/db/schema";
import { clientIp } from "@/lib/rate-limit";
import {
  fieldsForSigner,
  parseFieldValuesInput,
  recordSignerResponse,
  recordSignerView,
  redactSigner,
} from "@/lib/documents/signing";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

const findMySigner = async (requestId: string, user: { sub: string }) => {
  const request = await findById<SigningRequestRecord>(
    signingRequestsTable,
    requestId,
  );
  if (!request) return { request: null, signer: null };
  const signup = await findSignupByUserId(user.sub);
  const signer = signup
    ? request.signers.find(
        (s) => s.kind === "member" && s.signupId === signup.id,
      )
    : null;
  return { request, signer: signer ?? null };
};

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const { request, signer } = await findMySigner(id, user);
  if (!request || !signer) return notFound();

  const viewed = await recordSignerView(id, signer.id);
  const mine = viewed.signers.find((s) => s.id === signer.id)!;
  const document = await findById<DocumentRecord>(
    documentsTable,
    request.documentId,
  );
  const version = await findById<DocumentVersionRecord>(
    documentVersionsTable,
    request.sourceVersionId,
  );
  const canRespond =
    request.status === "sent" &&
    mine.status !== "signed" &&
    mine.status !== "declined" &&
    (request.mode === "parallel" ||
      viewed.signers.every(
        (s) => s.order >= mine.order || s.status === "signed",
      ));

  return NextResponse.json({
    document: document
      ? { title: document.title, category: document.category }
      : null,
    version: version ? { contentType: version.contentType } : null,
    signingRequestId: request.id,
    signingRequestStatus: request.status,
    versionId: request.sourceVersionId,
    signer: redactSigner(mine),
    fields: fieldsForSigner(viewed, mine.id),
    canRespond,
  });
};

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const { signer } = await findMySigner(id, user);
  if (!signer) return notFound();

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
      const signatureText = body.signatureText?.trim();
      if (!signatureText) {
        return NextResponse.json(
          { error: "Type your name to sign." },
          { status: 400 },
        );
      }
      await recordSignerResponse(id, signer.id, {
        action: "sign",
        signatureText,
        ip,
        userAgent,
        fieldValues: parseFieldValuesInput(body.fieldValues),
      });
      return NextResponse.json({ success: true });
    }
    if (body.action === "decline") {
      await recordSignerResponse(id, signer.id, {
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
