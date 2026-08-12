import { NextResponse, type NextRequest } from "next/server";
import type { SignupRecord } from "@/lib/api/types";
import {
  assignRealmRole,
  deleteUser,
  setUserEnabled,
} from "@/lib/auth/keycloak-admin";
import { requireApprover } from "@/lib/auth/session";
import { findById, toWireRecord, update } from "@/lib/db/repository";
import { signupsTable } from "@/lib/db/schema";

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = requireApprover(req);
  if (!approver) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { action } = (await req.json()) as { action?: string };
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (signup.status !== "pending") {
    return NextResponse.json(
      { error: `Already ${signup.status}` },
      { status: 409 },
    );
  }

  if (signup.keycloakUserId) {
    if (action === "approve") {
      await setUserEnabled(signup.keycloakUserId, true);
      await assignRealmRole(
        signup.keycloakUserId,
        process.env.ADMIN_ROLE ?? "brockcsc-admin",
      );
    } else {
      await deleteUser(signup.keycloakUserId);
    }
  }

  const reviewed = await update<SignupRecord>(signupsTable, id, {
    status: action === "approve" ? "approved" : "rejected",
    reviewedBy: approver.email || approver.name,
    reviewedAt: new Date().toISOString(),
  });
  if (!reviewed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(reviewed));
};
