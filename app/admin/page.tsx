"use client";

import { CheckCircle2, FileCheck2, Inbox, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { fetchDashboardStats } from "@/lib/api";
import type { PendingActionItem } from "@/lib/api/documents";
import { usePhone } from "@/lib/use-media-query";
import { useAdminMail } from "./chrome";
import { SECTION_ICONS } from "./icons";
import { pinnedSections } from "./nav";
import { AdminPage } from "./page-frame";
import { usePalette } from "./palette";
import { visibleSections } from "./sections";
import { useSession } from "./session";

/** A count row's source: undefined while loading, null when it failed or isn't allowed (the row hides). */
type Count<T = undefined> = { count: number; first?: T } | null | undefined;

const approvalTitle = (item: PendingActionItem) =>
  item.target?.signingRequestTitle ??
  item.target?.newTitle ??
  item.target?.documentTitle;

/**
 * The phone Home tab's status block (dash-3): what's waiting on the signed-in
 * user. Refetched whenever the tab comes back to the foreground.
 */
function useNeedsYou(enabled: boolean, approver: boolean) {
  const [signups, setSignups] = useState<Count>(undefined);
  const [approvals, setApprovals] = useState<Count<string>>(undefined);

  useEffect(() => {
    if (!enabled || !approver) return;
    let active = true;
    const load = () => {
      fetchDashboardStats()
        .then((stats) => {
          if (!active) return;
          setSignups(stats.signups ? { count: stats.signups.pending } : null);
        })
        .catch(() => active && setSignups(null));

      // A 401/403 (not an approver after all) hides the row like any failure.
      fetch("/api/documents/pending", { credentials: "same-origin" })
        .then((res) =>
          res.ok
            ? (res.json() as Promise<PendingActionItem[]>)
            : Promise.reject(new Error(String(res.status))),
        )
        .then((items) => {
          if (!active) return;
          const waiting = Array.isArray(items)
            ? items.filter((item) => item.status === "pending")
            : [];
          setApprovals({
            count: waiting.length,
            first: waiting[0] && approvalTitle(waiting[0]),
          });
        })
        .catch(() => active && setApprovals(null));
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, approver]);

  return approver
    ? { signups, approvals }
    : { signups: null as Count, approvals: null as Count<string> };
}

function NeedsYou({
  executive,
  approver,
}: {
  executive: boolean;
  approver: boolean;
}) {
  const { hasMailbox, unread } = useAdminMail();
  const { send } = usePalette();
  const phone = usePhone();
  const { signups, approvals } = useNeedsYou(phone, approver);

  // The inbox count lives in the shell (ChromeProvider refreshes it on
  // visibilitychange too). The shell only looks up executives' mailboxes,
  // so for anyone else, as with no mailbox at all, there's no row rather
  // than one that never stops loading.
  const mailPossible = executive && hasMailbox !== false;
  const mail: Count = !mailPossible
    ? null
    : unread == null
      ? undefined
      : { count: unread };

  const sources = [mail, signups, approvals];
  // Nothing this user could ever be asked for: no block at all.
  if (!mailPossible && !approver) return null;

  const rows = [
    mail && mail.count > 0 && (
      <ListRow
        key="mail"
        href="/admin/mail"
        icon={<Inbox />}
        title="Unread in Inbox"
        badge={mail.count}
      />
    ),
    signups && signups.count > 0 && (
      <ListRow
        key="signups"
        icon={<UserPlus />}
        title="Sign-ups to review"
        value={signups.count.toLocaleString()}
        onPress={() => send("/admin/users", { pending: true })}
      />
    ),
    approvals && approvals.count > 0 && (
      <ListRow
        key="approvals"
        href="/admin/documents#approvals"
        icon={<FileCheck2 />}
        title="Document approvals waiting"
        detail={approvals.first}
        value={approvals.count.toLocaleString()}
      />
    ),
  ].filter(Boolean);

  const settled = sources.every((source) => source !== undefined);
  if (rows.length === 0 && !settled) return null;

  return (
    <ListGroup header="Needs you">
      {rows.length > 0 ? (
        rows
      ) : (
        <ListRow
          icon={<CheckCircle2 />}
          title="All caught up"
          detail="Nothing is waiting on you."
        />
      )}
    </ListGroup>
  );
}

export default function AdminMenu() {
  const { user } = useSession();
  const { hasMailbox } = useAdminMail();

  const open = visibleSections(user, hasMailbox);
  // The phone list skips itself when every section already has a tab.
  const pinned = new Set(pinnedSections(open).map((section) => section.href));
  const listSections = open.some((section) => !pinned.has(section.href));

  return (
    <AdminPage>
      <h1 className="text-2xl font-extrabold text-ink md:text-3xl">
        Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 text-subtle phone:hidden">
        Pick what you want to work on.
      </p>

      <div className="mt-6 hidden flex-col gap-6 phone:flex">
        <NeedsYou
          executive={Boolean(user?.isExecutive)}
          approver={Boolean(user?.isApprover)}
        />

        {listSections ? (
          <ListGroup header="All sections">
            {open.map((section) => {
              const Icon = SECTION_ICONS[section.href];
              return (
                <ListRow
                  key={section.href}
                  href={section.href}
                  icon={Icon ? <Icon /> : undefined}
                  title={section.name}
                  detail={section.blurb}
                />
              );
            })}
          </ListGroup>
        ) : (
          <p className="px-1 text-sm text-subtle">
            {open.map((section) => section.name).join(" and ")} are in the tab
            bar below.
          </p>
        )}
      </div>

      <div className="mt-9 hidden items-start gap-3 desk:grid md:grid-cols-3">
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
    </AdminPage>
  );
}
