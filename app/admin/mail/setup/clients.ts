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
  {
    label: "Password",
    value: "an app password from above, not your usual one",
  },
];

export const CLIENT_GUIDES: ClientGuide[] = [
  {
    name: "iPhone and iPad",
    note: "Mail fills the servers in for you once it recognises the domain.",
    steps: [
      "Settings › Apps › Mail › Mail Accounts › Add Account › Other.",
      "Add Mail Account, then enter your name, your club address and the app password.",
      "Tap Next. If it asks for servers, choose IMAP and use the settings below for both incoming and outgoing.",
      "Tap Save.",
    ],
  },
  {
    name: "Mac (Apple Mail)",
    steps: [
      "Mail › Settings › Accounts › + › Other Mail Account.",
      "Enter your name, your club address and the app password, then Sign In.",
      "If it cannot find the settings, enter the ones below and pick IMAP.",
    ],
  },
  {
    name: "Gmail app (Android and iPhone)",
    note: "The Gmail app can carry other mailboxes, but it will not fetch these settings for you.",
    steps: [
      "Open the Gmail app, tap your avatar › Add another account › Other.",
      "Enter your club address, tap Next, then choose Personal (IMAP).",
      "Enter the app password.",
      "Set the incoming server to the IMAP settings below, then the outgoing server to the SMTP ones.",
    ],
  },
  {
    name: "Outlook (desktop and mobile)",
    note: "Outlook usually finds the settings on its own through autodiscover.",
    steps: [
      "Add an account and enter your club address.",
      "When it asks for a provider, choose IMAP.",
      "Enter the app password. If Outlook asks for servers, use the settings below.",
    ],
  },
  {
    name: "Thunderbird",
    note: "Thunderbird reads our autoconfig, so the servers should appear by themselves.",
    steps: [
      "Account Settings › Account Actions › Add Mail Account.",
      "Enter your name, your club address and the app password.",
      "Press Configure manually only if the automatic settings do not appear.",
    ],
  },
  {
    name: "Anything else",
    steps: [
      "Any app that speaks IMAP works: use the settings below.",
      "If it offers POP instead of IMAP, prefer IMAP - POP pulls mail off the server and other devices then miss it.",
    ],
  },
];
