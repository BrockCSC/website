"use client";

import { DashboardStats, fetchDashboardStats } from "@/lib/api";
import { DEDICATED_VM, type CostLine, type CostReport } from "@/lib/costs";
import { ArrowUpRight, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminPage } from "../page-frame";
import { usePalette } from "../palette";
import { useSession } from "../session";
import { Panel } from "../users/ui";
import { BarList, formatDay, plural, SplitBar, TrendChart } from "./charts";

type MailStats = { sent: number; received: number };

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

/** A plain click, not one that asks for a new tab or window. */
const plainClick = (event: React.MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

const tileClass =
  "relative h-full animate-rise-in rounded-[16px] border-2 border-line p-3 shadow-brut-sm transition duration-[var(--dur)] ease-smooth sm:p-3.5";

const Stat = ({
  label,
  period,
  value,
  detail,
  href,
  onOpen,
  hero,
  className,
}: {
  label: string;
  /** "(30 days)" after the label, from sm up; the page intro says it on phones. */
  period?: string;
  value: string;
  detail: string;
  href?: string;
  /** Replaces a plain click on the link (the href stays for new tabs). */
  onOpen?: () => void;
  hero?: boolean;
  className?: string;
}) => {
  const tile = (
    <div
      className={`${tileClass} ${
        href
          ? "group-hover:-translate-y-0.5 group-hover:bg-tint group-hover:shadow-[3px_5px_0_0_var(--shade)] motion-reduce:group-hover:translate-y-0 pointer-coarse:press"
          : // Only pressables carry a shadow on phones (D21), so linked
            // tiles read as linked (dash-missed-2).
            "hover:shadow-[3px_3px_0_0_var(--brand)] max-md:shadow-none"
      } ${hero ? "bg-raised" : "bg-surface"} ${href ? "" : (className ?? "")}`}
    >
      {href && (
        <>
          <ArrowUpRight
            aria-hidden
            className="absolute top-3 right-3 size-4 text-subtle transition duration-[var(--dur)] ease-smooth group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand max-md:hidden motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
          />
          <ChevronRight
            aria-hidden
            className="absolute top-2.5 right-2 size-5 text-subtle md:hidden"
          />
        </>
      )}
      <div
        className={`text-xs font-bold uppercase tracking-wide text-subtle ${hero ? "" : "min-h-8 sm:min-h-0"} ${href ? "pr-5" : ""}`}
      >
        {label}
        {period && <span className="max-sm:hidden"> ({period})</span>}
      </div>
      <div
        className={`mt-1 font-extrabold tabular-nums text-brand ${hero ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"}`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-subtle">{detail}</div>
    </div>
  );
  return href ? (
    <Link
      href={href}
      onClick={
        onOpen &&
        ((event) => {
          if (!plainClick(event)) return;
          event.preventDefault();
          onOpen();
        })
      }
      className={`group block rounded-[20px] ${className ?? ""}`}
    >
      {tile}
    </Link>
  ) : (
    tile
  );
};

/** A tinted bar the height of one line of text. */
const Bone = ({ className = "" }: { className?: string }) => (
  <span
    aria-hidden
    className={`inline-block rounded-[6px] bg-tint align-middle text-transparent ${className}`}
  >
    0
  </span>
);

/** A Stat's shape while the numbers load, so nothing below it jumps (dash-missed-5). */
const StatSkeleton = () => (
  <div className="h-full rounded-[16px] border-2 border-line/30 bg-surface p-3 sm:p-3.5">
    <div className="min-h-8 text-xs sm:min-h-0">
      <Bone className="w-24" />
    </div>
    <div className="mt-1 text-2xl sm:text-3xl">
      <Bone className="w-16" />
    </div>
    <div className="mt-1 text-sm">
      <Bone className="w-32 max-w-full" />
    </div>
  </div>
);

const Card = ({
  hint,
  ...rest
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => <Panel {...rest} note={hint} smallNote />;

/** A TrendChart card's final height, empty. */
const ChartSkeleton = ({ title }: { title: string }) => (
  <div aria-hidden>
    <Card title={title} hint=" ">
      <div className="mb-2 hidden h-6 pointer-coarse:block" />
      <div className="h-44 rounded-[12px] bg-tint/60" />
      <div className="mt-2 h-7" />
    </Card>
  </div>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="animate-fade-in rounded-[14px] border-2 border-dashed border-line/40 p-4 text-sm text-subtle">
    {children}
  </p>
);

const Failed = ({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry: () => void;
}) => (
  <div className="flex animate-rise-in flex-wrap items-center justify-between gap-3 rounded-[20px] border-2 border-line bg-surface p-5 md:shadow-brut">
    <p className="font-bold text-ink">{children}</p>
    <Button onClick={onRetry} size="sm" variant="outline">
      Retry
    </Button>
  </div>
);

const HealthRow = ({ label, value }: { label: string; value: number }) => (
  <li className="group flex justify-between gap-3 border-b-2 border-line/20 pb-2 transition-colors duration-[var(--dur-fast)] ease-smooth hover:border-brand">
    <span className="text-subtle transition-colors duration-[var(--dur-fast)] ease-smooth group-hover:text-ink">
      {label}
    </span>
    <span className="font-bold tabular-nums text-ink transition-colors duration-[var(--dur-fast)] ease-smooth group-hover:text-brand">
      {value}
    </span>
  </li>
);

const readJson = <T,>(url: string) =>
  fetch(url).then((res) =>
    res.ok
      ? (res.json() as Promise<T>)
      : Promise.reject(new Error(String(res.status))),
  );

export default function AnalyticsPage() {
  const { user } = useSession();
  const { send } = usePalette();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [mail, setMail] = useState<MailStats | "unavailable" | null>(null);
  const [report, setReport] = useState<CostReport | "unavailable" | null>(null);
  // Bumped on unmount and on every retry, so a stale response never lands.
  const statsRun = useRef(0);
  const costsRun = useRef(0);

  const loadStats = useCallback(() => {
    const current = statsRun.current;
    const live = () => statsRun.current === current;

    fetchDashboardStats()
      .then((data) => live() && setStats(data))
      .catch(() => live() && setStatsFailed(true));

    readJson<Partial<MailStats>>("/api/mail/stats?days=30")
      .then((data) => {
        if (
          typeof data?.sent !== "number" ||
          typeof data?.received !== "number"
        )
          throw new Error("unexpected payload");
        if (live()) setMail({ sent: data.sent, received: data.received });
      })
      .catch(() => live() && setMail("unavailable"));
  }, []);

  const loadCosts = useCallback(() => {
    const current = costsRun.current;
    const live = () => costsRun.current === current;
    readJson<CostReport>("/api/stats/costs")
      .then((data) => live() && setReport(data))
      .catch(() => live() && setReport("unavailable"));
  }, []);

  useEffect(() => {
    loadStats();
    return () => {
      statsRun.current += 1;
    };
  }, [loadStats]);

  const approver = Boolean(user?.isApprover);
  useEffect(() => {
    if (!approver) return;
    loadCosts();
    return () => {
      costsRun.current += 1;
    };
  }, [approver, loadCosts]);

  const retryCosts = () => {
    costsRun.current += 1;
    setReport(null);
    loadCosts();
  };

  const retryStats = () => {
    statsRun.current += 1;
    setStatsFailed(false);
    setMail(null);
    loadStats();
    if (approver && report === "unavailable") retryCosts();
  };

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
  const loading = !stats && !statsFailed;

  return (
    <AdminPage>
      <h1 className="text-3xl font-extrabold text-ink">Analytics</h1>
      <p className="mt-2 text-subtle">
        Traffic, sign-ups and mail over the last 30 days.
      </p>

      {statsFailed && (
        <div className="mt-8">
          <Failed onRetry={retryStats}>Could not load the numbers.</Failed>
        </div>
      )}

      {loading && (
        <div aria-busy className="mt-6 sm:mt-8">
          <p className="sr-only" role="status">
            Loading the numbers…
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: approver ? 4 : 3 }, (_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
          <div className="mt-6">
            <ChartSkeleton title="Visits per day" />
          </div>
        </div>
      )}

      {stats && views && peak && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
            <Stat
              label="Page views"
              period="30 days"
              value={views.last30Days.toLocaleString()}
              detail={viewsDetail(views)}
            />
            <Stat
              label="Mail handled"
              period="30 days"
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
                onOpen={() => send("/admin/users", { pending: true })}
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
                <TrendChart points={views.daily} unit="view" />
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Most visited pages" hint="Last 30 days">
                {views.topPaths.length > 0 ? (
                  <BarList
                    mono
                    rows={views.topPaths.map((entry) => ({
                      label: entry.path,
                      value: entry.views,
                    }))}
                    total={views.last30Days}
                    of="of all views"
                  />
                ) : (
                  <Note>No page views were recorded in this window.</Note>
                )}
              </Card>

              <Card
                title="Your mailbox"
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
                    <TrendChart
                      points={signups.daily}
                      unit="sign-up"
                      variant="bars"
                    />
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
                <HealthRow
                  label="Current executives"
                  value={stats.execs.current}
                />
                <HealthRow label="Past executives" value={stats.execs.past} />
                <HealthRow
                  label="Missing a photo or bio"
                  value={stats.execs.incompleteProfiles}
                />
                {stats.unclaimedTiles !== null && (
                  <HealthRow
                    label="Profiles without a login"
                    value={stats.unclaimedTiles}
                  />
                )}
                <HealthRow
                  label="Events run so far"
                  value={stats.events.past}
                />
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* Held back until the numbers above settle, so it doesn't render
          first and then jump a few thousand pixels (dash-missed-5). */}
      {approver && !loading && (
        <section className="mt-10">
          <h2 className="text-2xl font-extrabold text-ink">Projected bill</h2>
          <p className="mt-1 text-subtle">
            What the club&apos;s share of the hosting would cost at Oracle list
            prices. Everything runs on the free tier today, so nothing is
            actually charged.
          </p>

          {costs ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                <Stat
                  hero
                  className="col-span-2 sm:col-span-1"
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
                    className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4"
                  >
                    <dt className="text-subtle transition-colors duration-[var(--dur-fast)] ease-smooth group-hover:text-ink">
                      {row.label}
                    </dt>
                    <dd className="text-right font-bold tabular-nums text-ink transition-colors duration-[var(--dur-fast)] ease-smooth group-hover:text-brand">
                      {usd(row.value)}
                      <span className="max-sm:hidden"> / month</span>
                      <span className="sm:hidden">/mo</span>
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 grid gap-6">
                <div className="min-w-0">
                  <Card title="Where the money goes" hint="Last 30 days, USD">
                    <SplitBar
                      segments={costs.last30.lines.map((line) => ({
                        label: line.label,
                        value: line.amount,
                      }))}
                      format={usd}
                    />

                    {/* Phones: one row per line item, amounts on the right (dash-2). */}
                    <ul className="mt-4 sm:hidden">
                      {costs.last30.lines.map((line) => (
                        <li
                          key={line.key}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t-2 border-line/20 py-3"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-ink">
                              {line.label}
                            </div>
                            {line.note && (
                              <div className="text-sm text-subtle">
                                {line.note}
                              </div>
                            )}
                            <div className="text-sm tabular-nums text-subtle">
                              {quantity(line)} × ${line.unitPrice}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <a
                              href={line.source}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${line.label} price source (opens in a new tab)`}
                              className="press-flat grid size-11 place-items-center rounded-[10px] text-subtle"
                            >
                              <ExternalLink aria-hidden className="size-4" />
                            </a>
                            <span className="font-bold tabular-nums text-ink">
                              {usd(line.amount)}
                            </span>
                          </div>
                        </li>
                      ))}
                      <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t-2 border-line pt-3">
                        <span className="font-bold text-ink">Total</span>
                        <span className="font-extrabold tabular-nums text-brand">
                          {usd(costs.last30.total)}
                        </span>
                      </li>
                    </ul>

                    <div className="mt-5 hidden overflow-x-auto overscroll-x-contain sm:block">
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
                            <th className="pb-2 text-right font-bold">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {costs.last30.lines.map((line) => (
                            <tr
                              key={line.key}
                              className="border-t-2 border-line/20 transition-colors duration-[var(--dur-fast)] ease-smooth hover:bg-tint"
                            >
                              <td className="py-2 pr-3">
                                <a
                                  href={line.source}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-bold text-ink underline decoration-line/60 underline-offset-2 hover:decoration-brand pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                                >
                                  {line.label}
                                </a>
                                {line.note && (
                                  <span className="ml-2 text-xs text-subtle">
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
                </div>

                <Card
                  title="Club mail by sender"
                  hint={`${plural(costs.usage.totals.sent, "message")} sent and ${costs.usage.totals.received.toLocaleString()} received club-wide in the last ${costs.usage.days} days`}
                >
                  {senders.length > 0 ? (
                    <BarList
                      rows={senders.map((account) => ({
                        label: account.name,
                        value: account.sent,
                      }))}
                      total={costs.usage.totals.sent}
                      of="of club mail sent"
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
          ) : report === "unavailable" ? (
            <div className="mt-6">
              <Failed onRetry={retryCosts}>
                Cost figures are unavailable. The mail server could not be
                reached.
              </Failed>
            </div>
          ) : (
            <div className="mt-6">
              <Note>Loading cost figures…</Note>
            </div>
          )}
        </section>
      )}
    </AdminPage>
  );
}
