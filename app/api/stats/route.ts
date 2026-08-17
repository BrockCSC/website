import { and, count, desc, gte, lt, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type {
  DashboardStats,
  DayCount,
  EventRecord,
  ExecRecord,
  SignupRecord,
} from "@/lib/api/types";
import { requireApprover, requireMember } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { findAll, toWireRecord } from "@/lib/db/repository";
import {
  eventsTable,
  execsTable,
  pageViewsTable,
  signupsTable,
} from "@/lib/db/schema";
import { classifyEventsByTiming } from "@/lib/events/classify";
import { getEventTiming } from "@/lib/events/schedule";

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

/** Buckets follow the club's own calendar day, not the server's. */
const CLUB_TZ = "America/Toronto";
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ });

const dayOf = (value: string | number | Date): string | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DAY_FORMAT.format(date);
};

const zeroFilled = (
  days: number,
  now: number,
  counts: Map<string, number>,
): DayCount[] =>
  Array.from({ length: days }, (_, index) => {
    const day = DAY_FORMAT.format(new Date(now - (days - 1 - index) * DAY_MS));
    return { day, count: counts.get(day) ?? 0 };
  });

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

const topPaths = async (fromMs: number) => {
  const path = sql<string>`${pageViewsTable.data}->>'path'`;
  const rows = await db
    .select({ path, views: count() })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, new Date(fromMs)))
    .groupBy(path)
    .orderBy(desc(count()))
    .limit(5);
  return rows.map((row) => ({ path: row.path ?? "/", views: row.views }));
};

const viewsByDay = async (fromMs: number): Promise<Map<string, number>> => {
  const day = sql<string>`to_char("page_views"."created_at" AT TIME ZONE ${CLUB_TZ}::text, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, views: count() })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, new Date(fromMs)))
    .groupBy(day);
  return new Map(rows.map((row) => [row.day, row.views]));
};

const firstRecordedDay = async (): Promise<string | null> => {
  const [row] = await db
    .select({
      day: sql<
        string | null
      >`to_char(min(${pageViewsTable.createdAt}) AT TIME ZONE ${CLUB_TZ}::text, 'YYYY-MM-DD')`,
    })
    .from(pageViewsTable);
  return row?.day ?? null;
};

export const GET = async (req: NextRequest) => {
  if (!(await requireMember(req))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const now = Date.now();
  const [
    execs,
    events,
    last30Days,
    previous30Days,
    paths,
    daily,
    firstDay,
    approver,
  ] = await Promise.all([
    findAll<ExecRecord>(execsTable),
    findAll<EventRecord>(eventsTable),
    countViews(now - THIRTY_DAYS_MS, now),
    countViews(now - 2 * THIRTY_DAYS_MS, now - THIRTY_DAYS_MS),
    topPaths(now - THIRTY_DAYS_MS),
    viewsByDay(now - THIRTY_DAYS_MS),
    firstRecordedDay(),
    requireApprover(req),
  ]);

  const timing = classifyEventsByTiming(events.map(toWireRecord), now);
  const currentExecs = execs.filter((exec) => exec.isCurrentExec === true);

  const nextStart = [...timing.upcoming, ...timing.ongoing]
    .map((event) => ({
      title: event.title ?? "Untitled event",
      startsAt: getEventTiming(event, now).nextStartTimestamp,
    }))
    .filter(
      (entry): entry is { title: string; startsAt: number } =>
        typeof entry.startsAt === "number",
    )
    .sort((a, b) => a.startsAt - b.startsAt)[0];

  const signups = approver ? await findAll<SignupRecord>(signupsTable) : [];
  const linkedKeys = new Set(signups.map((signup) => signup.execKey));

  const signupsByDay = new Map<string, number>();
  for (const signup of signups) {
    const day = signup.submittedAt ? dayOf(signup.submittedAt) : null;
    if (day) signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  }
  const countStatus = (status: SignupRecord["status"]) =>
    signups.filter((signup) => signup.status === status).length;

  const stats: DashboardStats = {
    pageViews: {
      last30Days,
      previous30Days,
      topPaths: paths,
      daily: zeroFilled(30, now, daily),
      firstRecordedDay: firstDay,
    },
    execs: {
      current: currentExecs.length,
      past: execs.filter((exec) => exec.isCurrentExec === false).length,
      incompleteProfiles: currentExecs.filter(
        (exec) => !exec.image?.url || !exec.description?.trim(),
      ).length,
    },
    events: {
      upcoming: timing.upcoming.length + timing.ongoing.length,
      past: timing.past.length,
      next: nextStart
        ? {
            title: nextStart.title,
            inDays: Math.max(
              0,
              Math.round((nextStart.startsAt - now) / (24 * 60 * 60 * 1000)),
            ),
          }
        : null,
    },
    signups: approver
      ? {
          pending: countStatus("pending"),
          approved: countStatus("approved"),
          rejected: countStatus("rejected"),
          daily: zeroFilled(30, now, signupsByDay),
        }
      : null,
    unclaimedTiles: approver
      ? currentExecs.filter((exec) => !linkedKeys.has(exec.id)).length
      : null,
  };

  return NextResponse.json(stats);
};
