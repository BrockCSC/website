import { NextResponse, type NextRequest } from "next/server";
import type { RemoveSignerPayload } from "@/lib/api/types";
import { requireAdmin } from "@/lib/auth/session";
import { toWireRecord } from "@/lib/db/repository";
import { proposeOrApply } from "@/lib/documents/pending";
import { requestMeta } from "@/lib/documents/signer-routes";
import {
  redactSigningRequest,
  removeSignerFromRequest,
} from "@/lib/documents/signing";
import { notAuthorized } from "@/lib/json";

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> },
) => {
  const user = await requireAdmin(req);
  if (!user) return notAuthorized();
  const { id, signerId } = await params;
  const payload: RemoveSignerPayload = { signingRequestId: id, signerId };

  try {
    const outcome = await proposeOrApply(
      user,
      "remove-signer",
      payload,
      { signingRequestId: id },
      () =>
        removeSignerFromRequest(payload, {
          ...requestMeta(req),
          actorName: user.name,
        }),
    );
    return outcome.applied
      ? NextResponse.json(toWireRecord(redactSigningRequest(outcome.result)))
      : NextResponse.json(
          { pending: toWireRecord(outcome.pending) },
          { status: 202 },
        );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not remove signer.",
      },
      { status: 409 },
    );
  }
};
