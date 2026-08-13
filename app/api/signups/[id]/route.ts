import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import {
  assignRealmRole,
  deleteUser,
  setUserEnabled,
} from "@/lib/auth/keycloak-admin";
import { requireApprover } from "@/lib/auth/session";
import { findExecMatchingName } from "@/lib/db/execs";
import {
  create,
  findById,
  remove,
  toWireRecord,
  update,
} from "@/lib/db/repository";
import { execsTable, signupsTable } from "@/lib/db/schema";

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
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

  if (action === "approve") {
    if (!signup.keycloakUserId) {
      return NextResponse.json(
        { error: "No Keycloak account is linked to this request." },
        { status: 422 },
      );
    }
    await setUserEnabled(signup.keycloakUserId, true);
    await assignRealmRole(
      signup.keycloakUserId,
      process.env.ADMIN_ROLE ?? "executive",
    );
  } else if (signup.keycloakUserId) {
    await deleteUser(signup.keycloakUserId);
  }

  let execKey = signup.execKey;
  if (action === "approve" && !execKey) {
    const match = await findExecMatchingName(signup.firstName, signup.lastName);
    if (match && !match.claimed) {
      execKey = match.execKey;
    } else {
      const created = await create<ExecRecord>(execsTable, {
        name: [signup.firstName, signup.lastName].filter(Boolean).join(" "),
        title: "Executive",
        isCurrentExec: true,
      });
      execKey = created.id;
    }
  }

  const reviewed = await update<SignupRecord>(signupsTable, id, {
    status: action === "approve" ? "approved" : "rejected",
    execKey,
    reviewedBy: approver.email || approver.name,
    reviewedAt: new Date().toISOString(),
  });
  if (!reviewed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(toWireRecord(reviewed));
};

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const approver = await requireApprover(req);
  if (!approver) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await params;
  const signup = await findById<SignupRecord>(signupsTable, id);
  if (!signup) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (signup.keycloakUserId === approver.sub) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  }

  const deleteExec = new URL(req.url).searchParams.get("deleteExec") === "true";

  if (signup.keycloakUserId) {
    await deleteUser(signup.keycloakUserId);
  }
  if (deleteExec && signup.execKey) {
    await remove(execsTable, signup.execKey);
  }
  await remove(signupsTable, id);

  return new NextResponse(null, { status: 204 });
};
