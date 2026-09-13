import { NextResponse, type NextRequest } from "next/server";
import { confirmCurrentPassword } from "@/lib/auth/reauth";
import { requireMember } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";
import { startMigration } from "@/lib/identity/migration";
import { isRefusal, planRename } from "@/lib/identity/plan";
import { PreflightRequired } from "@/lib/identity/preflight";
import { MAX_NAME } from "@/lib/signups/patch";
import { badJson, jsonObject, notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

/** The second ask: PATCH /details already showed the consequences for this name. */
export const POST = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();
  const signup = await findSignupByUserId(user.sub);
  if (!signup) return notFound();

  const body = await jsonObject<{
    firstName?: unknown;
    lastName?: unknown;
    currentPassword?: unknown;
  }>(req);
  if (!body) return badJson();
  const { firstName, lastName, currentPassword } = body;
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !firstName.trim() ||
    !lastName.trim() ||
    firstName.length > MAX_NAME ||
    lastName.length > MAX_NAME
  ) {
    return NextResponse.json(
      { error: "First and last name are required." },
      { status: 400 },
    );
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json(
      { error: "Enter your current password." },
      { status: 401 },
    );
  }
  const refused = await confirmCurrentPassword(
    req,
    user,
    signup,
    currentPassword,
  );
  if (refused) return refused;

  const limited = rateLimit(req, "rename", 2, 24 * 60 * 60_000, signup.id);
  if (limited) return limited;

  const plan = await planRename(
    signup,
    { firstName, lastName },
    { sub: user.sub, kind: "self" },
  );
  if (isRefusal(plan)) {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }
  try {
    const record = await startMigration(plan, currentPassword);
    return NextResponse.json(
      { migrationId: record.id, rehearsal: record.mode === "rehearsal" },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof PreflightRequired) {
      return NextResponse.json(
        { error: `${err.message} Ask a co-president.` },
        { status: 409 },
      );
    }
    throw err;
  }
};
