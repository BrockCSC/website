import { NextResponse, type NextRequest } from "next/server";
import type { AddSignerPayload, SignerInput } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import {
  addSignerToRequest,
  redactSigningRequest,
} from "@/lib/documents/signing";
import { proposeOrApply } from "@/lib/documents/pending";
import { requestMeta } from "@/lib/documents/signer-routes";
import { badJson, jsonObject, notAuthorized } from "@/lib/json";

type Body = { signer?: unknown };

const parseSigner = (raw: unknown): SignerInput | null => {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.kind === "member" && typeof e.signupId === "string" && e.signupId) {
    return { kind: "member", signupId: e.signupId };
  }
  if (
    e.kind === "external" &&
    typeof e.name === "string" &&
    e.name.trim() &&
    typeof e.email === "string" &&
    e.email.trim()
  ) {
    return { kind: "external", name: e.name.trim(), email: e.email.trim() };
  }
  return null;
};

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id } = await params;

  const body = await jsonObject<Body>(req);
  if (!body) return badJson();
  const signer = parseSigner(body.signer);
  if (!signer) {
    return NextResponse.json(
      { error: "A valid signer is required." },
      { status: 400 },
    );
  }

  const payload: AddSignerPayload = { signingRequestId: id, signer };
  try {
    const outcome = await proposeOrApply(
      user,
      "add-signer",
      payload,
      { signingRequestId: id },
      () =>
        addSignerToRequest(payload, {
          ...requestMeta(req),
          actorName: user.name,
        }),
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
      { error: err instanceof Error ? err.message : "Could not add signer." },
      { status: 409 },
    );
  }
};
