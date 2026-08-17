const CAPABILITIES = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

const config = () => {
  const { STALWART_URL, STALWART_ADMIN_USER, STALWART_ADMIN_SECRET } =
    process.env;
  if (!STALWART_URL || !STALWART_ADMIN_USER || !STALWART_ADMIN_SECRET) {
    throw new Error("Stalwart url/user/secret env vars are not set.");
  }
  return {
    url: STALWART_URL.replace(/\/$/, ""),
    auth: Buffer.from(
      `${STALWART_ADMIN_USER}:${STALWART_ADMIN_SECRET}`,
    ).toString("base64"),
  };
};

type Call = [string, Record<string, unknown>, string];

const jmap = async <T>(calls: Call[]): Promise<T[]> => {
  const { url, auth } = config();
  const res = await fetch(`${url}/jmap`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ using: CAPABILITIES, methodCalls: calls }),
  });
  if (!res.ok) throw new Error(`Stalwart JMAP failed (${res.status}).`);

  const body = (await res.json()) as { methodResponses: Call[] };
  return body.methodResponses.map(([name, payload]) => {
    if (name === "error") {
      throw new Error(`Stalwart rejected the call: ${JSON.stringify(payload)}`);
    }
    return payload as T;
  });
};

type Account = {
  id: string;
  name: string;
  emailAddress: string;
  "@type"?: string;
  memberGroupIds?: Record<string, boolean>;
  permissions?: { disabledPermissions?: Record<string, boolean> };
};

const EXPUNGE = "imapExpunge";

const accounts = async (): Promise<Account[]> => {
  const [res] = await jmap<{ list: Account[] }>([["x:Account/get", {}, "c0"]]);
  return res.list;
};

const domainId = async (name: string): Promise<string> => {
  const [res] = await jmap<{ list: { id: string; name: string }[] }>([
    ["x:Domain/get", {}, "c0"],
  ]);
  const match = res.list.find((d) => d.name === name);
  if (!match) throw new Error(`Stalwart has no domain "${name}".`);
  return match.id;
};

export const localPartTaken = async (localPart: string): Promise<boolean> =>
  (await accounts()).some((a) => a.name === localPart);

export const createMailbox = async (mailbox: {
  localPart: string;
  displayName: string;
  alias?: string;
  domain: string;
}): Promise<string> => {
  const domain = await domainId(mailbox.domain);
  const aliases = mailbox.alias
    ? { 0: { name: mailbox.alias, domainId: domain, enabled: true } }
    : {};

  const [res] = await jmap<{
    created?: Record<string, { id: string }>;
    notCreated?: unknown;
  }>([
    [
      "x:Account/set",
      {
        create: {
          new: {
            "@type": "User",
            name: mailbox.localPart,
            domainId: domain,
            description: mailbox.displayName,
            roles: { "@type": "User" },
            aliases,
          },
        },
      },
      "c0",
    ],
  ]);

  const created = res.created?.new;
  if (!created) {
    throw new Error(
      `Stalwart did not create ${mailbox.localPart}: ${JSON.stringify(res.notCreated)}`,
    );
  }
  return created.id;
};

export const setGroupMembers = async (
  group: string,
  localParts: string[],
): Promise<void> => {
  const all = await accounts();
  const target = all.find((a) => a.name === group);
  if (!target) throw new Error(`Stalwart has no group "${group}".`);

  const wanted = new Set(localParts);
  const update: Record<string, Record<string, true | null>> = {};
  for (const account of all) {
    if (account.id === target.id) continue;
    const member = account.memberGroupIds?.[target.id] === true;
    const shouldBe = wanted.has(account.name);
    if (member !== shouldBe) {
      update[account.id] = {
        [`memberGroupIds/${target.id}`]: shouldBe ? true : null,
      };
    }
  }
  if (Object.keys(update).length === 0) return;

  await jmap([["x:Account/set", { update }, "c0"]]);
};

export const setExpungeAllowed = async (
  localParts: string[],
): Promise<void> => {
  const allowed = new Set(localParts);
  const update: Record<string, Record<string, unknown>> = {};
  for (const account of await accounts()) {
    if (account["@type"] !== "User") continue;
    const disable = !allowed.has(account.name);
    const disabled =
      account.permissions?.disabledPermissions?.[EXPUNGE] === true;
    if (disabled === disable) continue;
    update[account.id] = {
      permissions: {
        "@type": "Merge",
        enabledPermissions: {},
        disabledPermissions: { [EXPUNGE]: disable || null },
      },
    };
  }
  if (Object.keys(update).length === 0) return;

  await jmap([["x:Account/set", { update }, "c0"]]);
};

const accountNamed = async (localPart: string): Promise<Account | undefined> =>
  (await accounts()).find((a) => a.name === localPart);

export const isReadOnly = async (
  localPart: string,
): Promise<boolean | null> => {
  const account = await accountNamed(localPart);
  if (!account) return null;
  return account.permissions?.disabledPermissions?.emailSend === true;
};

const setReadOnly = async (
  localPart: string,
  readOnly: boolean,
): Promise<void> => {
  const account = await accountNamed(localPart);
  if (!account) return;

  await jmap([
    [
      "x:Account/set",
      {
        update: {
          [account.id]: {
            permissions: {
              "@type": "Merge",
              enabledPermissions: {},
              disabledPermissions: {
                emailSend: readOnly || null,
                jmapEmailSubmissionCreate: readOnly || null,
              },
            },
          },
        },
      },
      "c0",
    ],
  ]);
};

export const clearReadOnly = (localPart: string): Promise<void> =>
  setReadOnly(localPart, false);

export const makeReadOnly = (localPart: string): Promise<void> =>
  setReadOnly(localPart, true);

export type AppPassword = {
  id: string;
  description: string;
  createdAt: string;
};

export const listAppPasswords = async (
  localPart: string,
): Promise<AppPassword[]> => {
  const account = await accountNamed(localPart);
  if (!account) return [];
  const [res] = await jmap<{ list: AppPassword[] }>([
    ["x:AppPassword/get", { accountId: account.id }, "c0"],
  ]);
  return res.list;
};

/** The secret is returned once, at creation, and never readable again. */
export const createAppPassword = async (
  localPart: string,
  description: string,
): Promise<string | null> => {
  const account = await accountNamed(localPart);
  if (!account) return null;
  const [res] = await jmap<{ created?: Record<string, { secret: string }> }>([
    [
      "x:AppPassword/set",
      {
        accountId: account.id,
        create: {
          new: {
            description,
            permissions: { "@type": "Inherit" },
            allowedIps: {},
          },
        },
      },
      "c0",
    ],
  ]);
  return res.created?.new?.secret ?? null;
};

export const deleteAppPassword = async (
  localPart: string,
  id: string,
): Promise<void> => {
  const account = await accountNamed(localPart);
  if (!account) return;
  await jmap([
    ["x:AppPassword/set", { accountId: account.id, destroy: [id] }, "c0"],
  ]);
};

export const revokeAppPasswords = async (localPart: string): Promise<void> => {
  const account = await accountNamed(localPart);
  if (!account) return;
  const [res] = await jmap<{ list: AppPassword[] }>([
    ["x:AppPassword/get", { accountId: account.id }, "c0"],
  ]);
  if (!res.list.length) return;
  await jmap([
    [
      "x:AppPassword/set",
      { accountId: account.id, destroy: res.list.map((one) => one.id) },
      "c0",
    ],
  ]);
};
