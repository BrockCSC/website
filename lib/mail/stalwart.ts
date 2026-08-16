/** Stalwart provisioning over JMAP. Object shapes verified against 0.16.17;
 * re-check after a major upgrade. */

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

type Account = { id: string; name: string; emailAddress: string };

const accounts = async (): Promise<Account[]> => {
  const [res] = await jmap<{ list: Account[] }>([["x:Account/get", {}, "c0"]]);
  return res.list;
};

export const domainId = async (name: string): Promise<string> => {
  const [res] = await jmap<{ list: { id: string; name: string }[] }>([
    ["x:Domain/get", {}, "c0"],
  ]);
  const match = res.list.find((d) => d.name === name);
  if (!match) throw new Error(`Stalwart has no domain "${name}".`);
  return match.id;
};

/** Retired accounts keep their name, so a namesake never inherits their mail. */
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

/** disabledPermissions wins over anything inherited from roles or groups. */
export const makeReadOnly = async (localPart: string): Promise<void> => {
  const account = (await accounts()).find((a) => a.name === localPart);
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
                emailSend: true,
                jmapEmailSubmissionCreate: true,
              },
            },
          },
        },
      },
      "c0",
    ],
  ]);
};
