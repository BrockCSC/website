export type Section = {
  name: string;
  href: string;
  blurb: string;
  approverOnly?: boolean;
  mailboxOnly?: boolean;
};

export const SECTIONS: Section[] = [
  {
    name: "Email",
    href: "/admin/mail",
    blurb: "Read, write and file your club mail.",
    mailboxOnly: true,
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
  SECTIONS.find((section) => pathname.startsWith(section.href));
