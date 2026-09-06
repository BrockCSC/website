const CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:stalwart:jmap",
  "urn:ietf:params:jmap:sieve",
];

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

/** Authorization header value for acting as the Stalwart administrator. */
export const adminAuthorization = (): string => `Basic ${config().auth}`;

type Call = [string, Record<string, unknown>, string];

/** Raw method responses, per-call errors included. */
const jmapResponses = async (calls: Call[]): Promise<Call[]> => {
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
  return body.methodResponses;
};

const jmap = async <T>(calls: Call[]): Promise<T[]> =>
  (await jmapResponses(calls)).map(([name, payload]) => {
    if (name === "error") {
      throw new Error(`Stalwart rejected the call: ${JSON.stringify(payload)}`);
    }
    return payload as T;
  });

type Account = {
  id: string;
  name: string;
  emailAddress: string;
  "@type"?: string;
  description?: string;
  memberGroupIds?: Record<string, boolean>;
  permissions?: { disabledPermissions?: Record<string, boolean> };
};

const EXPUNGE = "imapExpunge";

const accounts = async (): Promise<Account[]> => {
  const [res] = await jmap<{ list: Account[] }>([["x:Account/get", {}, "c0"]]);
  return res.list;
};

type Domain = { id: string; name: string; catchAllAddress?: string | null };

const domainNamed = async (name: string): Promise<Domain> => {
  const [res] = await jmap<{ list: Domain[] }>([["x:Domain/get", {}, "c0"]]);
  const match = res.list.find((d) => d.name === name);
  if (!match) throw new Error(`Stalwart has no domain "${name}".`);
  return match;
};

const domainId = async (name: string): Promise<string> =>
  (await domainNamed(name)).id;

export const getCatchAll = async (domain: string): Promise<string | null> =>
  (await domainNamed(domain)).catchAllAddress ?? null;

export const setCatchAll = async (
  domain: string,
  address: string | null,
): Promise<void> => {
  await jmap([
    [
      "x:Domain/set",
      { update: { [await domainId(domain)]: { catchAllAddress: address } } },
      "c0",
    ],
  ]);
};

const refused = (res: {
  notUpdated?: Record<string, unknown>;
  notDestroyed?: Record<string, unknown>;
}) => {
  const problem = res.notUpdated ?? res.notDestroyed;
  if (problem && Object.keys(problem).length) {
    throw new Error(`Stalwart refused the change: ${JSON.stringify(problem)}`);
  }
};

const aliasEntries = (names: string[], domainId: string) =>
  Object.fromEntries(
    names.map((name, i) => [i, { name, domainId, enabled: true }]),
  );

export type MailingList = {
  id: string;
  name: string;
  emailAddress: string;
  description: string | null;
  aliases: string[];
  recipients: string[];
};

type RawList = Omit<MailingList, "description" | "aliases"> & {
  description?: string | null;
  aliases?: Record<string, { name: string }> | { name: string }[];
};

export const listMailingLists = async (): Promise<MailingList[]> => {
  const [res] = await jmap<{ list: RawList[] }>([
    ["x:MailingList/get", {}, "c0"],
  ]);
  return res.list.map((list) => ({
    id: list.id,
    name: list.name,
    emailAddress: list.emailAddress,
    description: list.description ?? null,
    aliases: Object.values(list.aliases ?? {}).map((a) => a.name),
    recipients: list.recipients ?? [],
  }));
};

export const createMailingList = async (list: {
  name: string;
  domain: string;
  description?: string;
  aliases?: string[];
  recipients: string[];
}): Promise<string> => {
  const domain = await domainId(list.domain);
  const [res] = await jmap<{
    created?: Record<string, { id: string }>;
    notCreated?: unknown;
  }>([
    [
      "x:MailingList/set",
      {
        create: {
          new: {
            name: list.name,
            domainId: domain,
            description: list.description,
            aliases: aliasEntries(list.aliases ?? [], domain),
            recipients: list.recipients,
          },
        },
      },
      "c0",
    ],
  ]);
  const created = res.created?.new;
  if (!created) {
    throw new Error(
      `Stalwart did not create ${list.name}: ${JSON.stringify(res.notCreated)}`,
    );
  }
  return created.id;
};

export const updateMailingList = async (
  id: string,
  patch: { description?: string; aliases?: string[]; recipients?: string[] },
  domain: string,
): Promise<void> => {
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.aliases) {
    update.aliases = aliasEntries(patch.aliases, await domainId(domain));
  }
  if (patch.recipients) update.recipients = patch.recipients;
  const [res] = await jmap<{ notUpdated?: Record<string, unknown> }>([
    ["x:MailingList/set", { update: { [id]: update } }, "c0"],
  ]);
  refused(res);
};

export const deleteMailingList = async (id: string): Promise<void> => {
  const [res] = await jmap<{ notDestroyed?: Record<string, unknown> }>([
    ["x:MailingList/set", { destroy: [id] }, "c0"],
  ]);
  refused(res);
};

export const localPartTaken = async (localPart: string): Promise<boolean> =>
  (await accounts()).some((a) => a.name === localPart);

export type MailUser = {
  id: string;
  name: string;
  emailAddress: string;
  description?: string;
  readOnly: boolean;
};

type Credential = Record<string, unknown> & { "@type": string };

/** Replaces the account password, keeping app passwords and API keys. */
export const setPassword = async (
  localPart: string,
  password: string,
): Promise<boolean> => {
  const target = (await accounts()).find(
    (a) => a["@type"] === "User" && a.name === localPart,
  );
  if (!target) return false;
  const [res] = await jmap<{ list: { credentials?: Credential[] }[] }>([
    ["x:Account/get", { ids: [target.id] }, "c0"],
  ]);
  const kept = (res.list[0]?.credentials ?? []).filter(
    (one) => one["@type"] !== "Password",
  );
  const [set] = await jmap<{ updated?: Record<string, unknown> }>([
    [
      "x:Account/set",
      {
        update: {
          [target.id]: {
            credentials: [{ "@type": "Password", secret: password }, ...kept],
          },
        },
      },
      "c1",
    ],
  ]);
  return Boolean(set.updated && target.id in set.updated);
};

/** Whether Stalwart accepts this password for the login name. */
export const passwordAccepted = async (
  login: string,
  password: string,
): Promise<boolean> => {
  const res = await fetch(`${config().url}/jmap/session`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
    },
  });
  return res.ok;
};

export const listUsers = async (): Promise<MailUser[]> =>
  (await accounts())
    .filter((a) => a["@type"] === "User")
    .map((a) => ({
      id: a.id,
      name: a.name,
      emailAddress: a.emailAddress,
      description: a.description,
      readOnly: a.permissions?.disabledPermissions?.emailSend === true,
    }));

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

const FORWARD_SCRIPT = "forward-to-co-presidents";

type SieveScript = { id: string; name: string; isActive: boolean };

const forwardScript = (accountId: string) =>
  jmap<{ list: SieveScript[] }>([
    ["SieveScript/get", { accountId, ids: null }, "c0"],
  ]).then(([res]) => res.list.find((s) => s.name === FORWARD_SCRIPT));

/** Local parts whose mail is currently forwarded; an account whose call failed counts as not forwarding. */
export const forwardingAccounts = async (): Promise<Set<string>> => {
  const users = (await accounts()).filter((a) => a["@type"] === "User");
  if (!users.length) return new Set();
  const results = await jmapResponses(
    users.map((u) => [
      "SieveScript/get",
      { accountId: u.id, ids: null },
      u.name,
    ]),
  );
  return new Set(
    results
      .filter(
        ([name, payload]) =>
          name !== "error" &&
          (payload as { list?: SieveScript[] }).list?.some(
            (s) => s.name === FORWARD_SCRIPT && s.isActive,
          ) === true,
      )
      .map(([, , localPart]) => localPart),
  );
};

const uploadSieve = async (
  accountId: string,
  script: string,
): Promise<string> => {
  const { url, auth } = config();
  const headers = { authorization: `Basic ${auth}` };
  const session = await fetch(`${url}/jmap/session`, { headers });
  if (!session.ok) {
    throw new Error(`Stalwart JMAP session failed (${session.status}).`);
  }
  const { uploadUrl } = (await session.json()) as { uploadUrl?: string };
  if (!uploadUrl) throw new Error("Stalwart session advertises no upload URL.");
  const res = await fetch(
    url +
      uploadUrl
        .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "")
        .replace("{accountId}", encodeURIComponent(accountId)),
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/sieve" },
      body: script,
    },
  );
  if (!res.ok) throw new Error(`Stalwart refused the upload (${res.status}).`);
  const blob = (await res.json()) as { blobId?: string };
  if (!blob.blobId) throw new Error("Stalwart returned no blob id.");
  return blob.blobId;
};

export const setForwarding = async (
  localPart: string,
  target: string | null,
): Promise<void> => {
  const account = await accountNamed(localPart);
  if (!account) return;
  const accountId = account.id;
  const existing = await forwardScript(accountId);

  if (!target) {
    if (!existing) return;
    const calls: Call[] = [
      ["SieveScript/set", { accountId, destroy: [existing.id] }, "c1"],
    ];
    if (existing.isActive) {
      calls.unshift([
        "SieveScript/set",
        { accountId, onSuccessDeactivateScript: true },
        "c0",
      ]);
    }
    await jmap(calls);
    return;
  }

  const quoted = target.replace(/[\\"]/g, "\\$&");
  const blobId = await uploadSieve(
    accountId,
    `require ["copy"];\nredirect :copy "${quoted}";\n`,
  );
  await jmap([
    [
      "SieveScript/set",
      existing
        ? {
            accountId,
            update: { [existing.id]: { blobId } },
            onSuccessActivateScript: existing.id,
          }
        : {
            accountId,
            create: { fwd: { name: FORWARD_SCRIPT, blobId } },
            onSuccessActivateScript: "#fwd",
          },
      "c0",
    ],
  ]);
};
