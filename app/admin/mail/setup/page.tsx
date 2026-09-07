"use client";

import { AtSign, Download, KeyRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "../../session";
import { Note, Panel } from "../../users/ui";
import { AppPasswords } from "./app-passwords";
import { CLIENT_GUIDES, SERVER_SETTINGS } from "./clients";

const Step = ({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="animate-fade-in rounded-[20px] border-2 border-line bg-surface p-5 shadow-brut">
    <Icon aria-hidden className="size-5 text-brand" />
    <h2 className="mt-2 text-sm font-extrabold uppercase tracking-wide text-ink">
      {title}
    </h2>
    <div className="mt-1 text-sm text-subtle">{children}</div>
  </div>
);

export default function MailSetupPage() {
  const [address, setAddress] = useState<string | null>(null);
  const { user } = useSession();

  useEffect(() => {
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email: string | null } | null) =>
        setAddress(data?.email ?? null),
      )
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-10">
      <Link
        className="text-sm font-bold text-brand underline underline-offset-4"
        href="/admin/mail"
      >
        Back to mail
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold text-ink">
        Your club mail on your own apps
      </h1>
      <p className="mt-2 max-w-prose text-subtle">
        {address ? (
          <>
            Read and send from <strong className="text-ink">{address}</strong>{" "}
            in Apple Mail, the Gmail app, Outlook or anything else that speaks
            IMAP.
          </>
        ) : (
          <>
            Read and send from your club address in Apple Mail, the Gmail app,
            Outlook or anything else that speaks IMAP.
          </>
        )}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Step icon={KeyRound} title="Use your usual password">
          The password you sign in here with works in any mail app. It follows
          your portal password each time you sign in, so if your last sign-in
          was before this change, sign out and in once.
        </Step>
        <Step icon={AtSign} title="Type your address, done">
          Outlook, Thunderbird and most apps fetch the servers on their own.
        </Step>
        <Step icon={Download} title="One tap on Apple devices">
          <Button asChild size="sm">
            <a download href="/api/mail/setup/profile">
              Add to iPhone, iPad or Mac
            </a>
          </Button>
          <span className="mt-2 block text-xs">
            Apple calls the profile unsigned and unverified. That is expected.
          </span>
        </Step>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {user?.identitiesEditable === false && (
          <Note>
            Password syncing is only rehearsed in this environment, so your
            portal password will not reach the mail server here.
          </Note>
        )}

        <Panel
          note="Most apps fill these in once you enter your address. Reach for them if yours asks."
          title="Server settings"
        >
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            {SERVER_SETTINGS.map((setting) => (
              <div className="contents" key={setting.label}>
                <dt className="text-sm font-semibold text-subtle">
                  {setting.label}
                </dt>
                <dd className="text-sm font-bold text-ink">{setting.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Add it to your app">
          <div className="flex flex-col gap-4">
            {CLIENT_GUIDES.map((guide) => (
              <details
                className="rounded-[14px] border-2 border-line bg-raised p-4"
                key={guide.name}
              >
                <summary className="cursor-pointer text-sm font-extrabold text-ink">
                  {guide.name}
                </summary>
                {guide.note && (
                  <p className="mt-2 text-sm text-subtle">{guide.note}</p>
                )}
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </Panel>

        <Panel
          note="Still works, and handy for a shared device. Make one per device and revoke it if that device goes missing."
          title="Prefer a separate password per device?"
        >
          <details className="rounded-[14px] border-2 border-line bg-raised p-4">
            <summary className="cursor-pointer text-sm font-extrabold text-ink">
              App passwords
            </summary>
            <div className="mt-4">
              <AppPasswords />
            </div>
          </details>
        </Panel>

        <Panel title="If it stops working">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Sign out of the portal and back in once, so your mailbox picks up
              the password you use now.
            </li>
            <li>
              Access is revoked when someone steps down, so mail apps stop at
              the same time the portal does.
            </li>
            <li>
              Sending is capped per day, and that cap counts mail sent from any
              app, not just this one.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
