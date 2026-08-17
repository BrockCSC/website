"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "../../users/ui";
import { AppPasswords } from "./app-passwords";
import { CLIENT_GUIDES, SERVER_SETTINGS } from "./clients";

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

      <div className="mt-8 flex flex-col gap-6">
        <Panel
          note="Your Brock sign-in will not work in a mail app. Make an app password instead, one per device, and revoke it if that device goes missing."
          title="1. Create an app password"
        >
          <AppPasswords />
        </Panel>

        <Panel
          note="Most apps fill these in once you enter your address. Reach for them if yours asks."
          title="2. Server settings"
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

        <Panel title="3. Add it to your app">
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
              Check you used the app password rather than your Brock password.
            </li>
            <li>
              App passwords are revoked when someone steps down, so mail apps
              stop at the same time the portal does.
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
