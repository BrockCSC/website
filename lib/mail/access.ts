import { adminAuthorization } from "./stalwart";

/** How a JMAP call authenticates and which account it reads. */
export type Access = { authorization: string; accountId?: string };

export const userAccess = (token: string): Access => ({
  authorization: `Bearer ${token}`,
});

export const adminAccess = (accountId: string): Access => ({
  authorization: adminAuthorization(),
  accountId,
});
