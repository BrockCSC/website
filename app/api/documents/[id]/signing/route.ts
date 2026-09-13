import { NextResponse, type NextRequest } from "next/server";
import type {
  DocumentRecord,
  SignerInput,
  StartSigningPayload,
} from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { findById, toWireRecord } from "@/lib/db/repository";
import { documentsTable } from "@/lib/db/schema";
import {
  redactSigningRequest,
  startSigningRequest,
} from "@/lib/documents/signing";
import { proposeOrApply } from "@/lib/documents/pending";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";

type Body = {
  title?: string;
  mode?: string;
  signers?: unknown;
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

  const payload: StartSigningPayload = { documentId: id, title, mode, signers };
  try {
    const outcome = await proposeOrApply(
      user,
      "start-signing",
      payload,
      { documentId: id },
      () =>
        startSigningRequest(
          { sub: user.sub, name: user.name, email: user.email },
          payload,
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
      { status: 400 },
    );
  }
};
