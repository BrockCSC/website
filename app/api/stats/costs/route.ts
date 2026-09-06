import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import {
  CLUB_SHARE,
  dedicatedVmCosts,
  monthlyCosts,
  PRICES,
  projectMonth,
  wholeVmCosts,
  worstCaseMessages,
  type CostReport,
} from "@/lib/costs";
import { notAuthorized } from "@/lib/json";
import { clubMailUsage } from "@/lib/mail/usage";

const WINDOW_DAYS = 30;

const torontoToday = () => {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { day, days: new Date(Date.UTC(year, month, 0)).getUTCDate() };
};

/** Club-wide mail usage and the club's share of the hosting bill. */
export const GET = async (req: NextRequest) => {
  if (!(await requireApprover(req))) return notAuthorized();

  const usage = await clubMailUsage(WINDOW_DAYS);
  const { day, days } = torontoToday();
  const elapsed = day / days;
  const monthLines = monthlyCosts({
    messagesPerMonth: usage.totals.sent * (day / WINDOW_DAYS),
  }).lines.map((one) =>
    one.key === "email"
      ? one
      : {
          ...one,
          quantity: one.quantity * elapsed,
          amount: one.amount * elapsed,
        },
  );
  const soFar = monthLines.reduce((sum, one) => sum + one.amount, 0);
  const messages = worstCaseMessages(usage.totals.dailyCap);

  const report: CostReport = {
    usage,
    share: CLUB_SHARE,
    month: {
      day,
      days,
      soFar,
      projected: projectMonth(soFar, day, days),
      lines: monthLines,
    },
    last30: monthlyCosts({ messagesPerMonth: usage.totals.sent }),
    comparators: {
      dedicatedVm: dedicatedVmCosts(usage.totals.sent).total,
      wholeVm: wholeVmCosts(usage.totals.sent).total,
      worstCaseEmail: {
        messages,
        amount: (messages / 1000) * PRICES.thousandMessages.usd,
      },
    },
    prices: { asOf: PRICES.asOf },
  };
  return NextResponse.json(report);
};
