/** A member's opt-in forward of their club mailbox to the personal email on their sign-up. */

import type {
  MailForwardingBlocker,
  MailForwardingView,
  SignupRecord,
} from "@/lib/api/types";
import { ownsIdentities } from "@/lib/env";
import { createApprovedSender } from "./oci-senders";
import { domain } from "./provision";
import {
  isReadOnly,
  personalForwardingActive,
  setPersonalForwarding,
  sieveString,
  validateSieve,
} from "./stalwart";

/** Stamped on every forwarded copy so a forward that finds its way back to a club mailbox isn't forwarded again. */
const FORWARDED_HEADER = "X-BrockCSC-Forwarded";

const EMAIL_PATTERN = /^[^\s@"\\<>]+@[^\s@"\\<>]+\.[^\s@"\\<>]+$/;

/**
 * OCI Email Delivery drops anything whose From isn't an approved sender, so the
 * forwarded copy goes out From the member's own club address with the real
 * sender kept in Reply-To — the way a mailing list rewrites mail it relays.
 * `keep` runs before any header is touched: Sieve actions snapshot the message
 * when they run, so the mailbox copy stays exactly as it arrived.
 */
const personalForwardingScript = (
  clubAddress: string,
  target: string,
): string =>
  [
    'require ["comparator-i;ascii-numeric", "copy", "editheader", "fileinto", "relational", "spamtestplus", "special-use", "variables"];',
    "",
    "# With a script active, spam is filed here; it is never forwarded.",
    'if anyof (spamtest :percent :value "ge" :comparator "i;ascii-numeric" "50",',
    '          header :matches "X-Spam-Status" "Yes*") {',
    '  fileinto :specialuse "\\\\Junk" "Junk Mail";',
    "  stop;",
    "}",
    "",
    "keep;",
    "",
    `if exists ${sieveString(FORWARDED_HEADER)} {`,
    "  stop;",
    "}",
    "",
    'set "sender" "";',
    'if address :all :matches "From" "*" {',
    '  set "sender" "${1}";',
    "}",
    'set "name" "";',
    'if header :matches "From" "\\"*\\" <*>" {',
    '  set "name" "${1}";',
    '} elsif header :matches "From" "* <*>" {',
    '  set "name" "${1}";',
    "}",
    'if anyof (string :is "${name}" "", string :contains "${name}" ["\\"", "\\\\"]) {',
    '  set "name" "${sender}";',
    "}",
    'if anyof (string :is "${name}" "", string :contains "${name}" ["\\"", "\\\\"]) {',
    '  set "name" "Unknown sender";',
    "}",
    "",
    'if not exists "Reply-To" {',
    '  if header :matches "From" "*" {',
    '    addheader "Reply-To" "${1}";',
    "  }",
    "}",
    'deleteheader "From";',
    'deleteheader "Sender";',
    'deleteheader "Return-Path";',
    'deleteheader "DKIM-Signature";',
    `addheader "From" ${sieveString('"${name} via BrockCSC" <' + clubAddress + ">")};`,
    `addheader ${sieveString(FORWARDED_HEADER)} ${sieveString(clubAddress)};`,
    `redirect :copy ${sieveString(target)};`,
    "",
  ].join("\n");

const clubAddressOf = (signup: SignupRecord) =>
  signup.username ? `${signup.username}@${domain()}` : null;

/** The address mail would forward to, or why it can't. */
const personalTarget = (
  signup: SignupRecord,
): { email: string } | { blocker: MailForwardingBlocker } => {
  const email = signup.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_PATTERN.test(email)) return { blocker: "no-personal-email" };
  if (email.endsWith(`@${domain()}`)) return { blocker: "club-address" };
  return { email };
};

/** What the profile page shows. The mail server, not the database, says whether forwarding is on. */
export const forwardingView = async (
  signup: SignupRecord,
): Promise<MailForwardingView> => {
  const clubAddress = clubAddressOf(signup);
  const base = {
    clubAddress,
    personalEmail: signup.email?.trim() || null,
    rehearsed: ownsIdentities() ? undefined : true,
  };
  const readOnly = signup.username ? await isReadOnly(signup.username) : null;
  if (!signup.username || readOnly === null) {
    return { ...base, enabled: false, blocker: "no-mailbox" };
  }

  const enabled = (await personalForwardingActive(signup.username)) === true;
  const target = personalTarget(signup);
  return {
    ...base,
    enabled,
    blocker: readOnly
      ? "read-only"
      : "blocker" in target
        ? target.blocker
        : null,
  };
};

/** Outside production: compiles the script Stalwart would run, without storing or activating anything. */
export const rehearsePersonalForwarding = async (
  signup: SignupRecord,
): Promise<void> => {
  const clubAddress = clubAddressOf(signup);
  const target = personalTarget(signup);
  if (!signup.username || !clubAddress || "blocker" in target) return;
  await validateSieve(
    signup.username,
    personalForwardingScript(clubAddress, target.email),
  );
};

/** Points the forward at the sign-up's current personal email, or removes it. */
export const applyPersonalForwarding = async (
  signup: SignupRecord,
  enabled: boolean,
): Promise<void> => {
  const clubAddress = clubAddressOf(signup);
  if (!signup.username || !clubAddress) return;
  const target = personalTarget(signup);
  if (!enabled || "blocker" in target) {
    await setPersonalForwarding(signup.username, null);
    return;
  }
  // provisionMailbox registers this too; repeated here so a mailbox that
  // predates approved senders can still forward.
  await createApprovedSender(clubAddress);
  await setPersonalForwarding(
    signup.username,
    personalForwardingScript(clubAddress, target.email),
  );
};

/**
 * Keeps an active forward following the personal email when an approver
 * edits it. Never throws: the edit itself has already been saved. If the
 * forward can't be moved it is switched off rather than left pointing at an
 * address the member may no longer own.
 */
export const followPersonalEmail = async (
  signup: SignupRecord,
): Promise<void> => {
  const username = signup.username;
  if (!ownsIdentities() || !username) return;
  try {
    if (!(await personalForwardingActive(username))) return;
    await applyPersonalForwarding(signup, true);
  } catch (err) {
    console.error(
      `could not move ${username}'s mail forwarding to their new personal email: ${err instanceof Error ? err.message : err}`,
    );
    await setPersonalForwarding(username, null).catch((stopErr) => {
      console.error(
        `could not switch off ${username}'s mail forwarding either: ${stopErr instanceof Error ? stopErr.message : stopErr}`,
      );
    });
  }
};
