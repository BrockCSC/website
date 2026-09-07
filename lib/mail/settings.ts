import { create, findAll, update } from "@/lib/db/repository";
import { mailSettingsTable } from "@/lib/db/schema";

export type MailSettings = {
  /** Where a read-only inbox copies its mail. Null forwards nowhere. */
  forwardTo: string | null;
  /** Read-only inboxes deliberately left alone, by local part. */
  forwardingOff: string[];
};

const DEFAULTS: MailSettings = { forwardTo: null, forwardingOff: [] };

export const readMailSettings = async (): Promise<MailSettings> => {
  const [row] = await findAll<Partial<MailSettings>>(mailSettingsTable);
  return {
    forwardTo: row?.forwardTo ?? DEFAULTS.forwardTo,
    forwardingOff: row?.forwardingOff ?? DEFAULTS.forwardingOff,
  };
};

export const writeMailSettings = async (
  patch: Partial<MailSettings>,
): Promise<MailSettings> => {
  const rows = await findAll<Partial<MailSettings>>(mailSettingsTable);
  const next = { ...(await readMailSettings()), ...patch };
  if (rows[0]) await update(mailSettingsTable, rows[0].id, next);
  else await create(mailSettingsTable, next);
  return next;
};
