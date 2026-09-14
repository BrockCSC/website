import { jmapResponses } from "./jmap-mail";
import { adminAuthorization, chunked, type MailUser } from "./stalwart";

export type Counts = { unread: number | null; total: number | null };

type InboxBox = {
  role: string | null;
  unreadEmails: number;
  totalEmails: number;
};

/** Null counts for an account whose call failed. */
export const inboxCounts = async (
  users: MailUser[],
): Promise<Map<string, Counts>> => {
  const responses = (
    await Promise.all(
      chunked(users).map((batch) =>
        jmapResponses(
          { authorization: adminAuthorization() },
          batch.map((user) => [
            "Mailbox/get",
            {
              accountId: user.id,
              ids: null,
              properties: ["role", "unreadEmails", "totalEmails"],
            },
            user.name,
          ]),
        ),
      ),
    )
  ).flat();
  return new Map(
    responses.map(([name, payload, id]) => {
      const inbox =
        name === "error"
          ? undefined
          : (payload as { list?: InboxBox[] }).list?.find(
              (box) => box.role === "inbox",
            );
      return [
        id,
        {
          unread: inbox?.unreadEmails ?? null,
          total: inbox?.totalEmails ?? null,
        },
      ];
    }),
  );
};
