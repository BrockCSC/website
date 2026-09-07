export type Section = {
  name: string;
  href: string;
  blurb: string;
  approverOnly?: boolean;
  execOnly?: boolean;
  mailboxOnly?: boolean;
  mailAdminOnly?: boolean;
};

export const SECTIONS: Section[] = [
  {
    name: "Email",
    href: "/admin/mail",
    blurb: "Read, write and file your club mail.",
    mailboxOnly: true,
  },
  {
    name: "Aliases",
    href: "/admin/mail/aliases",
    blurb: "Shared addresses, who receives them, forwarding and the catch-all.",
    mailAdminOnly: true,
  },
  {
    name: "Analytics",
    href: "/admin/analytics",
    blurb: "Traffic, sign-ups and mail volume.",
  },
  {
    name: "Events",
    href: "/admin/events",
    blurb: "Publish and edit what the club is running.",
    execOnly: true,
  },
  {
    name: "Users",
    href: "/admin/users",
    blurb: "Accounts, roles, profiles and mailboxes.",
    approverOnly: true,
  },
  {
    name: "Profile",
    href: "/admin/profile",
    blurb: "Your public tile, photo and account.",
  },
];

export const sectionFor = (pathname: string): Section | undefined =>
  SECTIONS.filter((section) => pathname.startsWith(section.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
