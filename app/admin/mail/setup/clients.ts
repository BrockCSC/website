export type ClientGuide = {
  name: string;
  note?: string;
  steps: string[];
};

export const MAIL_HOST = "mail.brockcsc.ca";

export const SERVER_SETTINGS = [
  { label: "Incoming (IMAP)", value: `${MAIL_HOST}, port 993, SSL/TLS` },
  { label: "Outgoing (SMTP)", value: `${MAIL_HOST}, port 465, SSL/TLS` },
  { label: "Username", value: "your full club address" },
  { label: "Password", value: "an app password made above" },
];

export type ServerRow = {
  label: string;
  value: string;
  /** Offer a copy button (only for values an app wants typed exactly). */
  copy: boolean;
};

/** One value per row, so each can be copied on its own (settings-16). */
export const serverRows = (address: string | null): ServerRow[] => [
  { label: "Incoming server", value: MAIL_HOST, copy: true },
  { label: "IMAP port", value: "993", copy: true },
  { label: "Outgoing server", value: MAIL_HOST, copy: true },
  { label: "SMTP port", value: "465", copy: true },
  { label: "Security", value: "SSL/TLS", copy: false },
  {
    label: "Username",
    value: address ?? "your full club address",
    copy: address != null,
  },
  { label: "Password", value: "an app password made above", copy: false },
];

export const CLIENT_GUIDES: ClientGuide[] = [
  {
    name: "iPhone and iPad",
    note: "The one-tap profile above does all of this for you, then asks for the app password. Here is the manual way.",
    steps: [
      "Settings › Apps › Mail › Mail Accounts › Add Account › Other.",
      "Add Mail Account, then enter your name, your club address, and paste your app password into Password.",
      "Tap Next. If it asks for servers, choose IMAP and use the settings above for both incoming and outgoing, with the same app password for each.",
      "Tap Save.",
    ],
  },
  {
    name: "Mac (Apple Mail)",
    note: "The one-tap profile above sets this up on a Mac too.",
    steps: [
      "Mail › Settings › Accounts › + › Other Mail Account.",
      "Enter your name and your club address, paste your app password into Password, then Sign In.",
      "If it cannot find the settings, enter the ones above and pick IMAP.",
    ],
  },
  {
    name: "Gmail app (Android and iPhone)",
    note: "The Gmail app can carry other mailboxes, but it will not fetch these settings for you.",
    steps: [
      "Open the Gmail app, tap your avatar › Add another account › Other.",
      "Enter your club address, tap Next, then choose Personal (IMAP).",
      "Paste your app password when it asks for the password.",
      "Set the incoming server to the IMAP settings above, then the outgoing server to the SMTP ones. Use your club address and the same app password for both.",
    ],
  },
  {
    name: "Outlook (desktop and mobile)",
    note: "Outlook finds the settings on its own through autodiscover.",
    steps: [
      "Add an account and enter your club address.",
      "When it asks for a provider, choose IMAP.",
      "Paste your app password into the password field. If Outlook asks for servers, use the settings above, with the same app password for SMTP.",
    ],
  },
  {
    name: "Thunderbird",
    note: "Thunderbird reads our autoconfig, so the servers appear by themselves.",
    steps: [
      "Account Settings › Account Actions › Add Mail Account.",
      "Enter your name and your club address, and paste your app password into Password.",
      "Press Configure manually only if the automatic settings do not appear.",
    ],
  },
  {
    name: "Anything else",
    steps: [
      "Any app that speaks IMAP works: use the settings above, with an app password as the password.",
      "If it offers POP instead of IMAP, prefer IMAP - POP pulls mail off the server and other devices then miss it.",
    ],
  },
];
