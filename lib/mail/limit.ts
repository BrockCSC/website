import type { MailLimitRequest, SignupRecord } from "@/lib/api/types";
import { jmap, mailAccountId } from "./jmap-mail";
import { isProtectedMailbox } from "./provision";

export const MAX_DAILY_LIMIT = 500;

export type MailAllowance = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  exempt: boolean;
  request: MailLimitRequest | null;
};

const defaultDailyLimit = (): number => {
  const set = Number(process.env.MAIL_DAILY_LIMIT);
  return Number.isFinite(set) && set > 0 ? Math.floor(set) : 50;
};

export const dailyLimitFor = (signup: SignupRecord | null): number =>
  signup?.mailDailyLimit && signup.mailDailyLimit > 0
    ? Math.floor(signup.mailDailyLimit)
    : defaultDailyLimit();

const today = () => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
};

/** Counted on the mail server, so sends from other clients count too. */
export const sentToday = async (token: string): Promise<number> => {
  const accountId = await mailAccountId(token);
  const [boxes] = (await jmap(token, [
    ["Mailbox/get", { accountId, ids: null, properties: ["id", "role"] }, "m0"],
  ])) as [{ list: { id: string; role: string | null }[] }];

  const sent = boxes.list.find((box) => box.role === "sent");
  if (!sent) return 0;

  const [found] = (await jmap(token, [
    [
      "Email/query",
      {
        accountId,
        filter: { inMailbox: sent.id, after: today().from },
        limit: 1,
        calculateTotal: true,
      },
      "q0",
    ],
  ])) as [{ total?: number }];
  return found.total ?? 0;
};

export const allowanceFor = async (
  token: string,
  signup: SignupRecord | null,
): Promise<MailAllowance> => {
  const limit = dailyLimitFor(signup);
  const used = await sentToday(token);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: today().to,
    exempt: !!signup?.username && isProtectedMailbox(signup.username),
    request: signup?.mailLimitRequest ?? null,
  };
};

export const overLimitMessage = ({ used, limit }: MailAllowance): string =>
  `You have sent ${used} of your ${limit} messages for today. The limit resets at midnight — ask a co-president for a higher one if you need to send more before then.`;
