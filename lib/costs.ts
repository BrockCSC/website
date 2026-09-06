import type { MailUsage } from "@/lib/mail/usage";

const HOURS_PER_MONTH = 730;
const ARM_PRICING = "https://www.oracle.com/cloud/compute/arm/pricing/";

const VPS = {
  shape: "VM.Standard.A1.Flex",
  ocpus: 4,
  memoryGb: 24,
  bootGb: 200,
  region: "ca-toronto-1",
};

/** The smallest sensible VM the club would rent on its own. */
export const DEDICATED_VM = { ocpus: 1, memoryGb: 6, bootGb: 50 };

/** The club's slice of the shared VM. */
export const CLUB_SHARE = {
  measuredOn: "2026-09-06",
  ocpu: 0.005,
  memoryGb: 1.2,
  diskGb: 2.5,
  note: "prod + uat apps, Stalwart, and the club's share of Keycloak and Postgres, measured with docker stats",
};

/** USD list prices, pinned by hand. */
export const PRICES = {
  asOf: "2026-09-06",
  ocpuHour: { usd: 0.01, source: ARM_PRICING },
  memoryGbHour: { usd: 0.0015, source: ARM_PRICING },
  storageGbMonth: {
    usd: 0.0425,
    source: "https://www.oracle.com/cloud/storage/block-volumes/pricing/",
  },
  thousandMessages: {
    usd: 0.085,
    source:
      "https://www.oracle.com/application-development/email-delivery/pricing/",
  },
  domainYear: { usd: 15, source: "https://www.cira.ca/en/whois/" },
};

export type CostLine = {
  key: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  source: string;
  note?: string;
};

export type Share = { ocpu: number; memoryGb: number; diskGb: number };

const line = (
  key: string,
  label: string,
  quantity: number,
  unit: string,
  price: { usd: number; source: string },
  note?: string,
): CostLine => ({
  key,
  label,
  quantity,
  unit,
  unitPrice: price.usd,
  amount: quantity * price.usd,
  source: price.source,
  note,
});

const cores = (ocpu: number) =>
  ocpu < 1 ? `${+(ocpu * 100).toFixed(2)}% of one core` : `${ocpu} OCPUs`;

export const monthlyCosts = ({
  messagesPerMonth,
  share = CLUB_SHARE,
}: {
  messagesPerMonth: number;
  share?: Share;
}): { lines: CostLine[]; total: number } => {
  const lines = [
    line(
      "compute",
      "Compute",
      share.ocpu * HOURS_PER_MONTH,
      "OCPU-hours",
      PRICES.ocpuHour,
      cores(share.ocpu),
    ),
    line(
      "memory",
      "Memory",
      share.memoryGb * HOURS_PER_MONTH,
      "GB-hours",
      PRICES.memoryGbHour,
      `${share.memoryGb} GB`,
    ),
    line(
      "storage",
      "Storage",
      share.diskGb,
      "GB-months",
      PRICES.storageGbMonth,
      "capacity + Balanced performance units",
    ),
    line(
      "email",
      "Email delivery",
      messagesPerMonth / 1000,
      "thousand messages",
      PRICES.thousandMessages,
      "one message per recipient; free tier covers 100/day",
    ),
    line(
      "domain",
      "Domain",
      1 / 12,
      "years",
      PRICES.domainYear,
      "estimate; brockcsc.ca renews 2028-09-14",
    ),
  ];
  return { lines, total: lines.reduce((sum, one) => sum + one.amount, 0) };
};

export const dedicatedVmCosts = (messagesPerMonth: number) =>
  monthlyCosts({
    messagesPerMonth,
    share: {
      ocpu: DEDICATED_VM.ocpus,
      memoryGb: DEDICATED_VM.memoryGb,
      diskGb: DEDICATED_VM.bootGb,
    },
  });

export const wholeVmCosts = (messagesPerMonth: number) =>
  monthlyCosts({
    messagesPerMonth,
    share: { ocpu: VPS.ocpus, memoryGb: VPS.memoryGb, diskGb: VPS.bootGb },
  });

export const projectMonth = (
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number,
) => (spentSoFar / Math.max(dayOfMonth, 1)) * daysInMonth;

export const worstCaseMessages = (dailyCap: number) => dailyCap * 30;

export type CostReport = {
  usage: MailUsage;
  share: typeof CLUB_SHARE;
  month: {
    day: number;
    days: number;
    soFar: number;
    projected: number;
    lines: CostLine[];
  };
  last30: { lines: CostLine[]; total: number };
  comparators: {
    dedicatedVm: number;
    wholeVm: number;
    worstCaseEmail: { messages: number; amount: number };
  };
  prices: { asOf: string };
};
