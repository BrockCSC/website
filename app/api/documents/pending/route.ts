import { NextResponse, type NextRequest } from "next/server";
import type { PendingDocumentActionRecord } from "@/lib/api/types";
import { requireAdmin, requireApprover } from "@/lib/auth/session";
import { type Entity, toWireRecord } from "@/lib/db/repository";
import {
  buildPendingActionTarget,
  listPendingActions,
  listPendingActionsForUser,
} from "@/lib/documents/pending";
import { notAuthorized } from "@/lib/json";

const withTargets = (items: Entity<PendingDocumentActionRecord>[]) =>
  Promise.all(
    items.map(async (item) => ({
      ...toWireRecord(item),
      target: await buildPendingActionTarget(item),
    })),
  );

export const GET = async (req: NextRequest) => {
  const mine = new URL(req.url).searchParams.get("mine") === "1";
  if (mine) {
    const user = await requireAdmin(req);
    if (!user) return notAuthorized();
    return NextResponse.json(
      await withTargets(await listPendingActionsForUser(user.sub)),
    );
  }

  const approver = await requireApprover(req);
  if (!approver) return notAuthorized();
  return NextResponse.json(await withTargets(await listPendingActions()));
};
