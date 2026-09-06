import { ownsIdentities } from "@/lib/env";
import { passwordAccepted, setPassword } from "./stalwart";

const domain = () => process.env.MAIL_DOMAIN ?? "brockcsc.ca";

/** Makes the mailbox accept the portal password; runs on each portal login. */
export const syncMailPassword = async (
  username: string,
  password: string,
): Promise<"unchanged" | "updated" | "skipped"> => {
  if (!ownsIdentities()) return "skipped";
  const localPart = username.toLowerCase();
  try {
    if (await passwordAccepted(`${localPart}@${domain()}`, password)) {
      return "unchanged";
    }
    return (await setPassword(localPart, password)) ? "updated" : "skipped";
  } catch (err) {
    console.warn(
      `mail password sync failed for ${localPart}: ${err instanceof Error ? err.message : err}`,
    );
    return "skipped";
  }
};
