import { and, count, gte, lt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type {
  DashboardStats,
  EventRecord,
  ExecRecord,
  SignupRecord,
} from "@/lib/api/types";
import { requireAdmin, requireApprover } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { findAll, toWireRecord } from "@/lib/db/repository";
import {
  eventsTable,
  execsTable,
  pageViewsTable,
  signupsTable,
} from "@/lib/db/schema";
import { classifyEventsByTiming } from "@/lib/events/classify";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const countViews = async (fromMs: number, toMs: number): Promise<number> => {
  const [row] = await db
    .select({ total: count() })
    .from(pageViewsTable)
    .where(
      and(
        gte(pageViewsTable.createdAt, new Date(fromMs)),
        lt(pageViewsTable.createdAt, new Date(toMs)),
      ),
    );
  return row?.total ?? 0;
};

export const GET = async (req: NextRequest) => {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const now = Date.now();
  const [execs, events, last30Days, previous30Days, approver] =
    await Promise.all([
      findAll<ExecRecord>(execsTable),
      findAll<EventRecord>(eventsTable),
      countViews(now - THIRTY_DAYS_MS, now),
      countViews(now - 2 * THIRTY_DAYS_MS, now - THIRTY_DAYS_MS),
      requireApprover(req),
    ]);

  const timing = classifyEventsByTiming(events.map(toWireRecord), now);

  const stats: DashboardStats = {
    pageViews: { last30Days, previous30Days },
    execs: {
      current: execs.filter((exec) => exec.isCurrentExec === true).length,
      past: execs.filter((exec) => exec.isCurrentExec === false).length,
    },
    events: {
      upcoming: timing.upcoming.length + timing.ongoing.length,
      past: timing.past.length,
    },
    pendingSignups: approver
      ? (await findAll<SignupRecord>(signupsTable)).filter(
          (signup) => signup.status === "pending",
        ).length
      : null,
  };

  return NextResponse.json(stats);
};
