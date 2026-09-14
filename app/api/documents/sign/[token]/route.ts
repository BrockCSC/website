import { NextResponse, type NextRequest } from "next/server";
import {
  signerSessionResponse,
  signerSignResponse,
} from "@/lib/documents/signer-routes";
import { findValidSignerToken } from "@/lib/documents/tokens";
import { rateLimit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;

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

/** SignerSessionView; the first call logs the "viewed" event. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-view", 60, HOUR_MS);
  if (limited) return limited;
  const { token } = await params;
  const lookup = await findValidSignerToken(token);
  if (!lookup) return INVALID();
  return signerSessionResponse(req, lookup.request, lookup.signer, {
    kind: "external",
    token,
  });
};

/** SignSubmission -> SignResult. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-submit", 20, HOUR_MS);
  if (limited) return limited;
  const { token } = await params;
  const lookup = await findValidSignerToken(token);
  if (!lookup) return INVALID();
  return signerSignResponse(req, lookup.request, lookup.signer, {
    kind: "external",
    token,
  });
};
