"use client";

import { AtSign, Download, KeyRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "../../users/ui";
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
  <div className="animate-fade-in rounded-[16px] border-2 border-line bg-surface p-4 shadow-brut-sm transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[6px_6px_0_0_var(--brand)]">
    <Icon aria-hidden className="size-5 text-brand" />
    <h2 className="mt-2 text-sm font-extrabold uppercase tracking-wide text-ink">
      {title}
    </h2>
    <div className="mt-1 text-sm text-subtle">{children}</div>
  </div>
);

export default function MailSetupPage() {
  const [address, setAddress] = useState<string | null>(null);

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
        <Step icon={KeyRound} title="Make an app password">
          Your portal password does not work in mail apps. Create an app
          password below and paste it wherever the app asks for a password.
        </Step>
        <Step icon={AtSign} title="Type your address">
          Your username is your full club address. Outlook, Thunderbird and most
          apps fetch the servers on their own.
        </Step>
        <Step icon={Download} title="One tap on Apple devices">
          <Button asChild size="sm">
            <a download href="/api/mail/setup/profile">
              Add to iPhone, iPad or Mac
            </a>
          </Button>
          <span className="mt-2 block text-xs">
            Paste your app password when the device asks for one. Apple calls
            the profile unsigned and unverified. That is expected.
          </span>
        </Step>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Panel
          note="It is shown once, so copy it before you leave the page."
          title="Start here: make an app password"
        >
          <AppPasswords />
        </Panel>

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

        <Panel title="If it stops working">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>
              Lost or revoked an app password? Make a new one above and paste it
              into the app in place of the old one.
            </li>
            <li>
              A co-president resetting your password revokes all of your app
              passwords. Once you have chosen your new password, make new ones.
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
