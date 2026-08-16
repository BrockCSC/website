import { NextResponse, type NextRequest } from "next/server";
import type { ExecRecord, SignupRecord } from "@/lib/api/types";
import {
  assignRealmRole,
  deleteUser,
  setUserEnabled,
} from "@/lib/auth/keycloak-admin";
import { requireApprover } from "@/lib/auth/session";
import { badJson, jsonObject } from "@/lib/json";
import { findExecMatchingName } from "@/lib/db/execs";
import { grantsApproval } from "@/lib/execs/titles";
import {
  isProtectedMailbox,
  makeMailboxReadOnly,
  provisionMailbox,
} from "@/lib/mail/provision";
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

  const body = await jsonObject<{ action?: string }>(req);
  if (!body) return badJson();
  const { action } = body;
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
  } else if (signup.keycloakUserId) {
    await deleteUser(signup.keycloakUserId);
  }

  let execKey = signup.execKey;
  let exec: (ExecRecord & { id?: string }) | undefined;
  if (action === "approve") {
    if (!execKey) {
      const match = await findExecMatchingName(
        signup.firstName,
        signup.lastName,
      );
      if (match && !match.claimed) {
        execKey = match.execKey;
        exec = (await findById<ExecRecord>(execsTable, execKey)) ?? undefined;
      } else {
        exec = await create<ExecRecord>(execsTable, {
          name: [signup.firstName, signup.lastName].filter(Boolean).join(" "),
          title: "Executive",
          isCurrentExec: true,
        });
        execKey = exec.id;
      }
    } else {
      exec = (await findById<ExecRecord>(execsTable, execKey)) ?? undefined;
    }

    // Alumni may edit their own tile and nothing else, whatever they once held.
    const isPastExec = exec?.isCurrentExec === false;
    const role = isPastExec
      ? (process.env.ALUMNI_ROLE ?? "alumni")
      : (process.env.ADMIN_ROLE ?? "executive");

    try {
      await assignRealmRole(signup.keycloakUserId!, role);
      if (!isPastExec && grantsApproval(exec?.title)) {
        await assignRealmRole(signup.keycloakUserId!, "co-president");
      }
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error && err.message.includes("not found")
              ? `The "${role}" realm role does not exist in Keycloak yet.`
              : "Could not assign the Keycloak role.",
        },
        { status: 422 },
      );
    }

    if (!isPastExec && signup.username) {
      try {
        await provisionMailbox({
          username: signup.username,
          firstName: signup.firstName ?? "",
          lastName: signup.lastName ?? "",
        });
      } catch {
        return NextResponse.json(
          {
            error:
              "The account is approved but the mailbox could not be created. Approve again to retry.",
          },
          { status: 422 },
        );
      }
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
  if (signup.username && isProtectedMailbox(signup.username)) {
    return NextResponse.json(
      {
        error: `"${signup.username}" is a service account and cannot be removed.`,
      },
      { status: 409 },
    );
  }

  const deleteExec = new URL(req.url).searchParams.get("deleteExec") === "true";

  if (signup.keycloakUserId) {
    await deleteUser(signup.keycloakUserId);
  }
  if (signup.username) {
    await makeMailboxReadOnly(signup.username);
  }
  if (deleteExec && signup.execKey) {
    await remove(execsTable, signup.execKey);
  }
  await remove(signupsTable, id);

  return new NextResponse(null, { status: 204 });
};
