"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { SECTIONS } from "./sections";

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
      (!section.mailboxOnly || hasMailbox),
  );

  return (
    <div className="mx-auto w-full max-w-[1060px] px-5 py-12">
      <h1 className="text-3xl font-extrabold text-ink">
        Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 text-subtle">Pick what you want to work on.</p>

      <div className="mt-9 grid gap-5 sm:grid-cols-2">
        {open.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut transition hover:-translate-y-0.5 hover:bg-tint"
          >
            <h2 className="text-xl font-extrabold text-brand">
              {section.name}
            </h2>
            <p className="mt-1.5 text-sm text-subtle">{section.blurb}</p>
          </Link>
        ))}
      </div>

      <Link
        href="/admin/profile"
        className="mt-8 inline-block font-bold text-ink underline underline-offset-4 hover:text-brand"
      >
        Your profile
      </Link>
    </div>
  );
}
