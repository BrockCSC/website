import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/api/types";

/** Four eyes: an approver may not review their own request. */
export const isSelfReview = (
  approver: SessionUser,
  ownerId: string | null | undefined,
) => Boolean(ownerId) && ownerId === approver.sub;

export const selfReviewRefused = (subject: "request" | "record") =>
  NextResponse.json(
    { error: `Another co-president has to review your own ${subject}.` },
    { status: 409 },
  );
