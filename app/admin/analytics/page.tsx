"use client";

import { DashboardStats, DayCount, fetchDashboardStats } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarList, formatDay, SplitBar, TrendChart } from "./charts";

type MailStats = { sent: number; received: number };

const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

const viewsDetail = ({
  last30Days,
  previous30Days,
  firstRecordedDay,
}: DashboardStats["pageViews"]) => {
  if (firstRecordedDay === null) return "Nothing recorded yet";
  if (previous30Days === 0) return "No earlier 30 days to compare with";
  const change = Math.round(
    ((last30Days - previous30Days) / previous30Days) * 100,
  );
  return change === 0
    ? "Level with the previous 30 days"
    : `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs previous 30 days`;
};

const Stat = ({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
}) => {
  const tile = (
    <div className="h-full rounded-[20px] border-2 border-line bg-surface p-4 shadow-brut-sm">
      <div className="text-xs font-bold uppercase tracking-wide text-subtle">
        {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold text-brand">{value}</div>
      <div className="mt-1 text-sm text-subtle">{detail}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {tile}
    </Link>
  ) : (
    tile
  );
};

const Card = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-[20px] border-2 border-line bg-surface p-5 shadow-brut">
    <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink">
      {title}
    </h2>
    {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[14px] border-2 border-dashed border-line/40 p-4 text-sm text-subtle">
    {children}
  </p>
);

const DayAxis = ({ points }: { points: DayCount[] }) => (
  <div className="mt-2 flex justify-between text-xs text-subtle">
    {[points[0], points[Math.floor(points.length / 2)], points.at(-1)].map(
      (point, index) =>
        point && <span key={index}>{formatDay(point.day)}</span>,
    )}
  </div>
);

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [mail, setMail] = useState<MailStats | "unavailable" | null>(null);

  useEffect(() => {
    let active = true;

    fetchDashboardStats()
      .then((data) => active && setStats(data))
      .catch(() => active && setStatsFailed(true));

    fetch("/api/mail/stats?days=30")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: Partial<MailStats>) => {
        if (
          typeof data?.sent !== "number" ||
          typeof data?.received !== "number"
        )
          throw new Error("unexpected payload");
        if (active) setMail({ sent: data.sent, received: data.received });
      })
      .catch(() => active && setMail("unavailable"));

    return () => {
      active = false;
    };
  }, []);

  const views = stats?.pageViews;
  const peak = views
    ? views.daily.reduce(
        (best, day) => (day.count > best.count ? day : best),
        views.daily[0],
      )
    : undefined;
  const trackedLate = Boolean(
    views?.firstRecordedDay && views.firstRecordedDay > views.daily[0].day,
  );
  const signups = stats?.signups;
  const signupsThisMonth = signups
    ? signups.daily.reduce((total, day) => total + day.count, 0)
    : 0;
  const mailStats = mail && mail !== "unavailable" ? mail : null;

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
      <h1 className="text-3xl font-extrabold text-ink">Analytics</h1>
      <p className="mt-2 text-subtle">
        Traffic, sign-ups and mail over the last 30 days.
      </p>

      {statsFailed && (
        <p className="mt-8 rounded-[20px] border-2 border-line bg-surface p-5 font-bold text-ink shadow-brut">
          Could not load the numbers. Reload the page to try again.
        </p>
      )}

      {stats && views && peak && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Page views (30 days)"
              value={views.last30Days.toLocaleString()}
              detail={viewsDetail(views)}
            />
            <Stat
              label="Mail handled (30 days)"
              value={
                mailStats
                  ? (mailStats.sent + mailStats.received).toLocaleString()
                  : "—"
              }
              detail={
                mailStats
                  ? `${plural(mailStats.sent, "sent")}, ${plural(mailStats.received, "received")}`
                  : mail === "unavailable"
                    ? "Mail stats unavailable"
                    : "Loading"
              }
            />
            {signups && (
              <Stat
                label="Sign-ups to review"
                value={signups.pending.toLocaleString()}
                detail={
                  signups.pending > 0
                    ? "Waiting on your review"
                    : "Nothing to review"
                }
                href="/admin/users"
              />
            )}
            <Stat
              label="Upcoming events"
              value={stats.events.upcoming.toLocaleString()}
              detail={
                stats.events.next
                  ? `Next: ${stats.events.next.title} in ${plural(stats.events.next.inDays, "day")}`
                  : "Nothing scheduled"
              }
              href="/admin/events"
            />
          </div>

          <div className="mt-6 grid gap-6">
            <Card
              title="Visits per day"
              hint={
                views.firstRecordedDay
                  ? `Peak ${plural(peak.count, "view")} on ${formatDay(peak.day)}${
                      trackedLate
                        ? `. Tracking only started ${formatDay(views.firstRecordedDay)}, so earlier days are blank`
                        : ""
                    }`
                  : undefined
              }
            >
              {views.firstRecordedDay === null ? (
                <Note>
                  No page view has ever been recorded, so this is not a real
                  zero — check that the public site is reporting views.
                </Note>
              ) : (
                <>
                  <TrendChart points={views.daily} unit="views" />
                  <DayAxis points={views.daily} />
                </>
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Most visited pages" hint="Last 30 days">
                {views.topPaths.length > 0 ? (
                  <BarList
                    rows={views.topPaths.map((entry) => ({
                      label: entry.path,
                      value: entry.views,
                    }))}
                  />
                ) : (
                  <Note>No page views were recorded in this window.</Note>
                )}
              </Card>

              <Card
                title="Mail volume"
                hint="Last 30 days in your club mailbox"
              >
                {mailStats ? (
                  mailStats.sent + mailStats.received > 0 ? (
                    <SplitBar
                      segments={[
                        { label: "Received", value: mailStats.received },
                        { label: "Sent", value: mailStats.sent },
                      ]}
                    />
                  ) : (
                    <Note>No mail was sent or received in the last month.</Note>
                  )
                ) : (
                  <Note>
                    {mail === "unavailable"
                      ? "Mail statistics are unavailable. You need a club mailbox to see them."
                      : "Loading mail volume…"}
                  </Note>
                )}
              </Card>
            </div>

            {signups && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card
                  title="Sign-up approvals"
                  hint="Every account request ever made"
                >
                  {signups.pending + signups.approved + signups.rejected > 0 ? (
                    <SplitBar
                      segments={[
                        { label: "Pending", value: signups.pending },
                        { label: "Approved", value: signups.approved },
                        { label: "Rejected", value: signups.rejected },
                      ]}
                    />
                  ) : (
                    <Note>Nobody has signed up yet.</Note>
                  )}
                </Card>

                <Card
                  title="Sign-ups per day"
                  hint={`${plural(signupsThisMonth, "request")} in the last 30 days`}
                >
                  {signupsThisMonth > 0 ? (
                    <>
                      <TrendChart points={signups.daily} unit="sign-ups" />
                      <DayAxis points={signups.daily} />
                    </>
                  ) : (
                    <Note>
                      No new sign-ups in the last 30 days. Invite codes are
                      handed out in person, so a flat line is normal outside
                      recruiting season.
                    </Note>
                  )}
                </Card>
              </div>
            )}

            <Card title="Team and content health">
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li className="flex justify-between gap-3 border-b-2 border-line/20 pb-2">
                  <span className="text-subtle">Current executives</span>
                  <span className="font-bold tabular-nums text-ink">
                    {stats.execs.current}
                  </span>
                </li>
                <li className="flex justify-between gap-3 border-b-2 border-line/20 pb-2">
                  <span className="text-subtle">Past executives</span>
                  <span className="font-bold tabular-nums text-ink">
                    {stats.execs.past}
                  </span>
                </li>
                <li className="flex justify-between gap-3 border-b-2 border-line/20 pb-2">
                  <span className="text-subtle">Missing a photo or bio</span>
                  <span className="font-bold tabular-nums text-ink">
                    {stats.execs.incompleteProfiles}
                  </span>
                </li>
                {stats.unclaimedTiles !== null && (
                  <li className="flex justify-between gap-3 border-b-2 border-line/20 pb-2">
                    <span className="text-subtle">
                      Profiles without a login
                    </span>
                    <span className="font-bold tabular-nums text-ink">
                      {stats.unclaimedTiles}
                    </span>
                  </li>
                )}
                <li className="flex justify-between gap-3 border-b-2 border-line/20 pb-2">
                  <span className="text-subtle">Events run so far</span>
                  <span className="font-bold tabular-nums text-ink">
                    {stats.events.past}
                  </span>
                </li>
              </ul>
            </Card>
          </div>
        </>
      )}

      {!stats && !statsFailed && (
        <p className="mt-8 text-subtle">Loading the numbers…</p>
      )}
    </div>
  );
}
