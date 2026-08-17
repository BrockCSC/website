"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { SECTIONS } from "./sections";
import { SECTION_ICONS } from "./icons";

export default function AdminMenu() {
  const { user } = useSession();
  const [hasMailbox, setHasMailbox] = useState(true);

  useEffect(() => {
    if (!user?.isExecutive) return;
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email: string | null } | null) => {
        if (data) setHasMailbox(Boolean(data.email));
      })
      .catch(() => {});
  }, [user?.isExecutive]);

  const open = SECTIONS.filter(
    (section) =>
      (!section.approverOnly || user?.isApprover) &&
      (!section.execOnly || user?.isExecutive) &&
      (!section.mailboxOnly || hasMailbox),
  );

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-12">
      <h1 className="text-3xl font-extrabold text-ink">
        Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 text-subtle">Pick what you want to work on.</p>

      <div className="mt-9 grid gap-5 sm:grid-cols-2">
        {open.map((section, index) => {
          const Icon = SECTION_ICONS[section.href];
          return (
            <Link
              key={section.href}
              href={section.href}
              style={{ animationDelay: `${index * 20}ms` }}
              className="group flex animate-rise-in items-start gap-4 rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut hover:-translate-y-0.5 hover:bg-tint motion-reduce:hover:translate-y-0"
            >
              {Icon && (
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-line bg-tint text-brand">
                  <Icon className="size-6" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xl font-extrabold text-brand">
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
