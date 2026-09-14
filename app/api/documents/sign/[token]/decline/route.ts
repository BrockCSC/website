import { NextResponse, type NextRequest } from "next/server";
import { signerDeclineResponse } from "@/lib/documents/signer-routes";
import { findValidSignerToken } from "@/lib/documents/tokens";
import { rateLimit } from "@/lib/rate-limit";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const limited = rateLimit(req, "documents-sign-submit", 20, 60 * 60 * 1000);
  if (limited) return limited;
  const { token } = await params;
  const lookup = await findValidSignerToken(token);
  if (!lookup) {
    return NextResponse.json(
      { error: "This signing link is invalid or has expired." },
      { status: 400 },
    );
  }
  return signerDeclineResponse(req, lookup.request, lookup.signer);
};
