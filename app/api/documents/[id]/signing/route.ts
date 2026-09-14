import { NextResponse, type NextRequest } from "next/server";
import type {
  DocumentRecord,
  SigningFieldInput,
  SigningFieldType,
  SignerInput,
} from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import {
  SigningError,
  sanitizeCertificateText,
} from "@/lib/documents/envelope";
import { SIGNING_FIELD_TYPES } from "@/lib/documents/fields";
import { requestMeta } from "@/lib/documents/signer-routes";
import {
  type StartSigningInput,
  assertSignable,
  redactSigningRequest,
  startSigningRequest,
} from "@/lib/documents/signing";
import { proposeOrApply } from "@/lib/documents/pending";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

type Body = {
  title?: string;
  mode?: string;
  signers?: unknown;
  fields?: unknown;
};

const FIELD_TYPES = new Set<string>(SIGNING_FIELD_TYPES.map((t) => t.value));

/**
 * signerIndex is checked against `signerCount` here; startSigningRequest
 * resolves it to a real signer id once signers actually exist. `undefined`
 * (fields omitted) is valid and distinct from `null` (fields present but
 * invalid).
 */
const parseFields = (
  raw: unknown,
  signerCount: number,
): SigningFieldInput[] | null | undefined => {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 200) return null;
  const fields: SigningFieldInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const page = Number(e.page);
    const xPercent = Number(e.xPercent);
    const yPercent = Number(e.yPercent);
    const signerIndex = Number(e.signerIndex);
    if (
      typeof e.type !== "string" ||
      !FIELD_TYPES.has(e.type) ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isFinite(xPercent) ||
      xPercent < 0 ||
      xPercent > 100 ||
      !Number.isFinite(yPercent) ||
      yPercent < 0 ||
      yPercent > 100 ||
      !Number.isInteger(signerIndex) ||
      signerIndex < 0 ||
      signerIndex >= signerCount
    ) {
      return null;
    }
    fields.push({
      type: e.type as SigningFieldType,
      page,
      xPercent,
      yPercent,
      signerIndex,
      required: e.required !== false,
      label:
        typeof e.label === "string" && e.label.trim()
          ? sanitizeCertificateText(e.label).slice(0, 80) || undefined
          : undefined,
    });
  }
  return fields;
};

const parseSigners = (raw: unknown): SignerInput[] | null => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const signers: SignerInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (e.kind === "member" && typeof e.signupId === "string" && e.signupId) {
      signers.push({ kind: "member", signupId: e.signupId });
    } else if (
      e.kind === "external" &&
      typeof e.name === "string" &&
      e.name.trim() &&
      typeof e.email === "string" &&
      e.email.trim()
    ) {
      signers.push({
        kind: "external",
        name: e.name.trim(),
        email: e.email.trim(),
      });
    } else {
      return null;
    }
  }
  return signers;
};

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;
  const document = await findById<DocumentRecord>(documentsTable, id);
  if (!document) return notFound();
  if (!document.currentVersionId) {
    return NextResponse.json(
      { error: "Upload a version before starting a signing request." },
      { status: 409 },
    );
  }

  const body = await jsonObject<Body>(req);
  if (!body) return badJson();
  const title = body.title?.trim();
  const mode =
    body.mode === "ordered" || body.mode === "parallel" ? body.mode : null;
  const signers = parseSigners(body.signers);
  if (!title || !mode || !signers) {
    return NextResponse.json(
      { error: "A title, a mode and at least one valid signer are required." },
      { status: 400 },
    );
  }
  const fields = parseFields(body.fields, signers.length);
  if (fields === null) {
    return NextResponse.json(
      { error: "One of the placed fields is invalid." },
      { status: 400 },
    );
  }

  const meta = requestMeta(req);
  const payload: StartSigningInput = {
    documentId: id,
    sourceVersionId: document.currentVersionId,
    title,
    mode,
    signers,
    fields,
    createdByIp: meta.ip,
  };
  try {
    // Checked before queueing too, so a proposer hears about an in-progress
    // request or a missing Signature field now, not when a co-president
    // approves.
    await assertSignable(payload);
    const outcome = await proposeOrApply(
      user,
      "start-signing",
      payload,
      { documentId: id },
      () =>
        startSigningRequest(
          { sub: user.sub, name: user.name, email: user.email },
          payload,
          meta,
        ),
    );
    return outcome.applied
      ? NextResponse.json(toWireRecord(redactSigningRequest(outcome.result)), {
          status: 201,
        })
      : NextResponse.json(
          { pending: toWireRecord(outcome.pending) },
          { status: 202 },
        );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not start signing.",
      },
      { status: err instanceof SigningError ? err.status : 400 },
    );
  }
};
