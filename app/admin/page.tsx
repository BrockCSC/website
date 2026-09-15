"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { visibleSections } from "./sections";
import { SECTION_ICONS } from "./icons";

export default function AdminMenu() {
  const { user } = useSession();
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.isExecutive) return;
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email: string | null } | null) => {
        if (data) setHasMailbox(Boolean(data.email));
      })
      .catch(() => {});
  }, [user?.isExecutive]);

  const open = visibleSections(user, hasMailbox);

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-8">
      <h1 className="text-3xl font-extrabold text-ink">
        Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 text-subtle">Pick what you want to work on.</p>

      <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-3">
        {open.map((section, index) => {
          const Icon = SECTION_ICONS[section.href];
          return (
            <Link
              key={section.href}
              href={section.href}
              style={{ animationDelay: `${index * 20}ms` }}
              className="group flex animate-rise-in items-start gap-4 rounded-[16px] border-2 border-line bg-surface p-4 shadow-brut hover:-translate-y-0.5 hover:bg-tint hover:shadow-[6px_8px_0_0_var(--shade)] motion-reduce:hover:translate-y-0"
            >
              {Icon && (
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] border-2 border-line bg-tint text-brand transition duration-[var(--dur)] ease-smooth group-hover:-rotate-6 group-hover:bg-brand group-hover:text-brand-ink motion-reduce:group-hover:rotate-0">
                  <Icon className="size-5" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-base font-extrabold text-brand">
                  {section.name}
                </span>
                <span className="mt-1.5 block text-sm text-subtle">
                  {section.blurb}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
