"use client";

import { DashboardStats, DayCount, fetchDashboardStats } from "@/lib/api";
import { DEDICATED_VM, type CostLine, type CostReport } from "@/lib/costs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "../session";
import { Panel } from "../users/ui";
import { BarList, formatDay, SplitBar, TrendChart } from "./charts";

type MailStats = { sent: number; received: number };

const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

const usd = (amount: number) => `$${amount.toFixed(2)}`;

const quantity = (line: CostLine) =>
  `${line.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${line.unit}`;

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
  hero,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  hero?: boolean;
}) => {
  const tile = (
    <div
      className={`h-full animate-rise-in rounded-[20px] border-2 border-line p-4 shadow-brut-sm ${hero ? "bg-raised" : "bg-surface"}`}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-subtle">
        {label}
      </div>
      <div
        className={`mt-1 font-extrabold text-brand ${hero ? "text-4xl" : "text-3xl"}`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-subtle">{detail}</div>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
    >
      {tile}
    </Link>
  ) : (
    tile
  );
};

const Card = ({
  hint,
  ...rest
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => <Panel {...rest} note={hint} smallNote />;

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="animate-fade-in rounded-[14px] border-2 border-dashed border-line/40 p-4 text-sm text-subtle">
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
  const { user } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [mail, setMail] = useState<MailStats | "unavailable" | null>(null);
  const [report, setReport] = useState<CostReport | "unavailable" | null>(null);

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

  useEffect(() => {
    if (!user?.isApprover) return;
    let active = true;
    fetch("/api/stats/costs")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: CostReport) => active && setReport(data))
      .catch(() => active && setReport("unavailable"));
    return () => {
      active = false;
    };
  }, [user?.isApprover]);

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
  const costs = report && report !== "unavailable" ? report : null;
  const senders = costs
    ? costs.usage.accounts
        .filter((account) => account.sent > 0)
        .sort((a, b) => b.sent - a.sent)
    : [];

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
      <h1 className="text-3xl font-extrabold text-ink">Analytics</h1>
      <p className="mt-2 text-subtle">
        Traffic, sign-ups and mail over the last 30 days.
      </p>

      {statsFailed && (
        <p className="mt-8 animate-rise-in rounded-[20px] border-2 border-line bg-surface p-5 font-bold text-ink shadow-brut">
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
                  ? `${mailStats.sent} sent, ${mailStats.received} received`
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
      {user?.isApprover && (
        <section className="mt-10">
          <h2 className="text-2xl font-extrabold text-ink">Projected bill</h2>
          <p className="mt-1 text-subtle">
            What the club&apos;s share of the hosting would cost at Oracle list
            prices. Everything runs on the free tier today, so nothing is
            actually charged.
          </p>

          {costs ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Stat
                  hero
                  label="This month so far"
                  value={usd(costs.month.soFar)}
                  detail={`projected ${usd(costs.month.projected)} by month end`}
                />
                <Stat
                  label="Last 30 days"
                  value={usd(costs.last30.total)}
                  detail="the club's measured share, at list prices"
                />
                <Stat
                  label="Sending headroom"
                  value={`${costs.usage.totals.dailyCap.toLocaleString()} / day`}
                  detail={`${(costs.usage.totals.sent / costs.usage.days).toFixed(1)} sent per day on average, across ${costs.usage.accounts.length} mailboxes`}
                />
              </div>

              <dl className="mt-6 grid gap-2 rounded-[14px] border-2 border-dashed border-line/40 p-4 text-sm">
                {[
                  {
                    label: "Club share of the shared VM",
                    value: costs.last30.total,
                  },
                  {
                    label: `A dedicated ${DEDICATED_VM.ocpus} OCPU / ${DEDICATED_VM.memoryGb} GB / ${DEDICATED_VM.bootGb} GB VM`,
                    value: costs.comparators.dedicatedVm,
                  },
                  {
                    label: "The whole shared VM, other projects included",
                    value: costs.comparators.wholeVm,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-wrap justify-between gap-x-4"
                  >
                    <dt className="text-subtle">{row.label}</dt>
                    <dd className="font-bold tabular-nums text-ink">
                      {usd(row.value)} / month
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 grid gap-6">
                <Card title="Where the money goes" hint="Last 30 days, USD">
                  <SplitBar
                    segments={costs.last30.lines.map((line) => ({
                      label: line.label,
                      value: line.amount,
                    }))}
                    format={usd}
                  />
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-bold uppercase tracking-wide text-subtle">
                          <th className="pb-2 font-bold">Item</th>
                          <th className="pb-2 text-right font-bold">
                            Quantity
                          </th>
                          <th className="pb-2 text-right font-bold">
                            Unit price
                          </th>
                          <th className="pb-2 text-right font-bold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.last30.lines.map((line) => (
                          <tr
                            key={line.key}
                            className="border-t-2 border-line/20"
                          >
                            <td className="py-2 pr-3">
                              <a
                                href={line.source}
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold text-ink underline decoration-line/60 underline-offset-2 hover:decoration-brand"
                              >
                                {line.label}
                              </a>
                              {line.note && (
                                <span className="ml-2 whitespace-nowrap text-xs text-subtle">
                                  {line.note}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-subtle">
                              {quantity(line)}
                            </td>
                            <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-subtle">
                              ${line.unitPrice}
                            </td>
                            <td className="py-2 pl-3 text-right font-bold tabular-nums text-ink">
                              {usd(line.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-line">
                          <td className="pt-2 font-bold text-ink" colSpan={3}>
                            Total
                          </td>
                          <td className="pt-2 text-right font-extrabold tabular-nums text-brand">
                            {usd(costs.last30.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>

                <Card
                  title="Mail volume"
                  hint={`${plural(costs.usage.totals.sent, "message")} sent and ${costs.usage.totals.received.toLocaleString()} received club-wide in the last ${costs.usage.days} days`}
                >
                  {senders.length > 0 ? (
                    <BarList
                      rows={senders.map((account) => ({
                        label: account.name,
                        value: account.sent,
                      }))}
                    />
                  ) : (
                    <Note>Nobody sent any mail in this window.</Note>
                  )}
                </Card>

                <Note>
                  Prices are Oracle&apos;s public list prices as of{" "}
                  {costs.prices.asOf}; the domain line is an estimate. The club
                  share was measured on {costs.share.measuredOn}:{" "}
                  {costs.share.note}. Oracle bills whole OCPUs, so this share is
                  a metered estimate, not an invoice. Month-to-date sending is
                  scaled from the 30-day total; if every mailbox hit its cap (
                  {plural(costs.comparators.worstCaseEmail.messages, "message")}{" "}
                  a month) the email line would be{" "}
                  {usd(costs.comparators.worstCaseEmail.amount)}.
                </Note>
              </div>
            </>
          ) : (
            <div className="mt-6">
              <Note>
                {report === "unavailable"
                  ? "Cost figures are unavailable. The mail server could not be reached."
                  : "Loading cost figures…"}
              </Note>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
