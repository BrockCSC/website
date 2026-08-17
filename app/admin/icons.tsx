type IconProps = { className?: string };

const base = (className?: string) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className,
});

export const MailIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="m3.5 7 7.4 5.4a2 2 0 0 0 2.2 0L20.5 7" />
  </svg>
);

export const ChartIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6" />
    <path d="M13 20V8" />
    <path d="M18 20v-9" />
  </svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M8 15h3" />
  </svg>
);

export const PeopleIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6" />
    <path d="M17.6 14.4A6.5 6.5 0 0 1 21.5 20" />
  </svg>
);

export const BadgeIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <circle cx="12" cy="10" r="2.5" />
    <path d="M8 17.5a4 4 0 0 1 8 0" />
  </svg>
);

export const SECTION_ICONS: Record<
  string,
  (props: IconProps) => React.ReactElement
> = {
  "/admin/mail": MailIcon,
  "/admin/analytics": ChartIcon,
  "/admin/events": CalendarIcon,
  "/admin/users": PeopleIcon,
  "/admin/profile": BadgeIcon,
};
