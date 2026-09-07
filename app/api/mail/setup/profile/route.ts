import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { MAIL_HOST } from "@/app/admin/mail/setup/clients";
import { requireMember } from "@/lib/auth/session";
import { findSignupByUserId } from "@/lib/db/signups";
import { notAuthorized, notFound } from "@/lib/json";

/** Stable per address, so reinstalling replaces the profile instead of adding one. */
const uuidFor = (seed: string) => {
  const hex = createHash("sha256").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ]
    .join("-")
    .toUpperCase();
};

const escapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const xml = (value: string) => value.replace(/[&<>]/g, (c) => escapes[c]);

const profile = (
  username: string,
  address: string,
  name: string,
) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>ca.brockcsc.mail.${xml(username)}</string>
  <key>PayloadUUID</key><string>${uuidFor(address)}</string>
  <key>PayloadDisplayName</key><string>Brock CSC Mail</string>
  <key>PayloadOrganization</key><string>Brock Computer Science Club</string>
  <key>PayloadDescription</key><string>Sets up ${xml(address)} in Mail.</string>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key><string>com.apple.mail.managed</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>ca.brockcsc.mail.${xml(username)}.account</string>
      <key>PayloadUUID</key><string>${uuidFor(`${address}/account`)}</string>
      <key>PayloadDisplayName</key><string>Brock CSC Mail</string>
      <key>EmailAccountDescription</key><string>Brock CSC</string>
      <key>EmailAccountName</key><string>${xml(name)}</string>
      <key>EmailAccountType</key><string>EmailTypeIMAP</string>
      <key>EmailAddress</key><string>${xml(address)}</string>
      <key>IncomingMailServerAuthentication</key><string>EmailAuthPassword</string>
      <key>IncomingMailServerHostName</key><string>${MAIL_HOST}</string>
      <key>IncomingMailServerPortNumber</key><integer>993</integer>
      <key>IncomingMailServerUseSSL</key><true/>
      <key>IncomingMailServerUsername</key><string>${xml(address)}</string>
      <key>OutgoingMailServerAuthentication</key><string>EmailAuthPassword</string>
      <key>OutgoingMailServerHostName</key><string>${MAIL_HOST}</string>
      <key>OutgoingMailServerPortNumber</key><integer>465</integer>
      <key>OutgoingMailServerUseSSL</key><true/>
      <key>OutgoingMailServerUsername</key><string>${xml(address)}</string>
      <key>OutgoingPasswordSameAsIncomingPassword</key><true/>
    </dict>
  </array>
</dict>
</plist>
`;

export const GET = async (req: NextRequest) => {
  const user = await requireMember(req);
  if (!user) return notAuthorized();

  const signup = await findSignupByUserId(user.sub);
  if (!signup?.username) return notFound();

  const address = `${signup.username}@${process.env.MAIL_DOMAIN ?? "brockcsc.ca"}`;
  const name =
    [signup.firstName, signup.lastName].filter(Boolean).join(" ") || address;

  return new Response(profile(signup.username, address, name), {
    headers: {
      "content-type": "application/x-apple-aspen-config",
      "content-disposition":
        'attachment; filename="brockcsc-mail.mobileconfig"',
      "cache-control": "private, no-store",
    },
  });
};
