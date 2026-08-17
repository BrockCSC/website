import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/api/types";

/**
 * Four eyes. This is the only thing between a co-president and approving
 * their own request, so every review route has to run it - which is why it
 * lives here rather than being written out again in each one.
 */
export const isSelfReview = (
  approver: SessionUser,
  ownerId: string | null | undefined,
) => Boolean(ownerId) && ownerId === approver.sub;

export const selfReviewRefused = (subject: "request" | "record") =>
  NextResponse.json(
    { error: `Another co-president has to review your own ${subject}.` },
    { status: 409 },
  );
