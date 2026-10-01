"use client";

import {
  ArrowDown,
  AtSign,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup } from "@/components/ui/list-group";
import { announce } from "@/lib/announce";
import { useMediaQuery } from "@/lib/use-media-query";
import { useAdminMail, useTopBar, type TopBarConfig } from "../../chrome";
import { AdminPage } from "../../page-frame";
import { Panel } from "../../users/ui";
import { AppPasswords } from "./app-passwords";
import { CLIENT_GUIDES, SERVER_SETTINGS, serverRows } from "./clients";

const TOP_BAR: TopBarConfig = {
  back: { label: "Mail", href: "/admin/mail" },
  title: "Set up on phone",
};

type Platform = "iPhone" | "iPad" | "Mac" | "android" | "other";

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  // iPadOS asks for the desktop site: a "Macintosh" with a touch screen.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  return "other";
};
const noSubscribe = () => () => {};
const serverPlatform = (): Platform => "other";

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

/** A numbered checklist row (below sm). */
const StepRow = ({
  n,
  title,
  detail,
  href,
  download,
  glyph: Glyph,
}: {
  n: number;
  title: string;
  detail?: string;
  href: string;
  download?: boolean;
  glyph: LucideIcon;
}) => (
  <li>
    <a
      className="press-flat flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-ink"
      download={download || undefined}
      href={href}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-[10px] border-2 border-line text-sm font-extrabold"
      >
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">{title}</span>
        {detail && <span className="text-sm text-subtle">{detail}</span>}
      </span>
      <Glyph aria-hidden className="size-5 shrink-0 text-subtle" />
    </a>
  </li>
);

/** A 44px copy button: Copy, then a check for 2s. */
function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      aria-label={`Copy ${label.toLowerCase()}`}
      className="press-flat grid size-11 shrink-0 place-items-center rounded-[10px] text-ink"
      onClick={() => {
        clearTimeout(timer.current);
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            announce(`${label} copied`);
            timer.current = setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => announce("Couldn't copy. Press and hold the value."));
      }}
      type="button"
    >
      {copied ? (
        <Check aria-hidden className="size-5" />
      ) : (
        <Copy aria-hidden className="size-5" />
      )}
    </button>
  );
}

export default function MailSetupPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [secretMade, setSecretMade] = useState(false);
  const { mailAddress } = useAdminMail();
  const platform = useSyncExternalStore(
    noSubscribe,
    detectPlatform,
    serverPlatform,
  );
  // Below sm the secret box says it on its own; dropping the note brings the
  // name field above the fold.
  const narrow = useMediaQuery("(max-width: 639.98px)");
  const apple =
    platform === "iPhone" || platform === "iPad" || platform === "Mac";

  useTopBar(TOP_BAR);

  useEffect(() => {
    fetch("/api/mail/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email: string | null } | null) =>
        setAddress(data?.email ?? null),
      )
      .catch(() => {});
  }, []);

  const username = address ?? mailAddress;

  return (
    <AdminPage className="max-w-[860px]" padY={10}>
      <Link
        className="hidden items-center gap-1 text-sm font-bold text-brand underline underline-offset-4 desk:inline-flex pointer-coarse:min-h-11"
        href="/admin/mail"
      >
        <ChevronLeft
          aria-hidden
          className="hidden size-4 pointer-coarse:block"
        />
        Back to mail
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-ink phone:mt-0 sm:text-3xl">
        Your club mail on your own apps
      </h1>
      <p className="mt-2 max-w-prose text-subtle">
        {address ? (
          <>
            Read and send from <strong className="text-ink">{address}</strong>{" "}
            <span className="max-sm:hidden">
              in Apple Mail, the Gmail app, Outlook or anything else that speaks
              IMAP.
            </span>
            <span className="sm:hidden">in any mail app.</span>
          </>
        ) : (
          <>
            Read and send from your club address in{" "}
            <span className="max-sm:hidden">
              Apple Mail, the Gmail app, Outlook or anything else that speaks
              IMAP.
            </span>
            <span className="sm:hidden">any mail app.</span>
          </>
        )}
      </p>

      <div className="mt-8 grid gap-4 max-sm:hidden sm:grid-cols-3">
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

      <ListGroup className="mt-5 sm:hidden">
        <StepRow
          glyph={ArrowDown}
          href="#app-password"
          n={1}
          title="Make an app password"
        />
        {apple && (
          <StepRow
            detail={
              secretMade
                ? "Paste the password when it asks. Apple calls the profile unverified; that's expected."
                : "Make a password first"
            }
            download
            glyph={Download}
            href="/api/mail/setup/profile"
            n={2}
            title={`Install on this ${platform}`}
          />
        )}
        <StepRow
          glyph={ArrowDown}
          href="#server-settings"
          n={apple ? 3 : 2}
          title="Or add it manually"
        />
      </ListGroup>

      <div className="mt-5 flex flex-col gap-6 sm:mt-6">
        <div className="scroll-mt-4" id="app-password">
          <Panel
            note={
              narrow
                ? undefined
                : "It is shown once, so copy it before you leave the page."
            }
            title="Start here: make an app password"
          >
            <AppPasswords onSecret={() => setSecretMade(true)} />
          </Panel>
        </div>

        <div className="scroll-mt-4" id="server-settings">
          <Panel
            note="Most apps fill these in once you enter your address. Reach for them if yours asks."
            title="Server settings"
          >
            <ul className="-my-1 divide-y-2 divide-line/15 lg:hidden">
              {serverRows(username).map((row) => (
                <li
                  className="flex min-h-12 items-center gap-3 py-1"
                  key={row.label}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-subtle">
                      {row.label}
                    </div>
                    <div
                      className={
                        row.copy
                          ? "font-mono text-sm font-bold wrap-anywhere text-ink select-all"
                          : "text-sm font-bold text-ink"
                      }
                    >
                      {row.value}
                    </div>
                  </div>
                  {row.copy && (
                    <CopyButton label={row.label} value={row.value} />
                  )}
                </li>
              ))}
            </ul>
            <dl className="grid gap-x-6 gap-y-2 max-lg:hidden sm:grid-cols-[auto_1fr]">
              {SERVER_SETTINGS.map((setting) => (
                <div className="contents" key={setting.label}>
                  <dt className="text-sm font-semibold text-subtle">
                    {setting.label}
                  </dt>
                  <dd className="text-sm font-bold text-ink">
                    {setting.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <Panel title="Add it to your app">
          <div className="flex flex-col gap-4">
            {CLIENT_GUIDES.map((guide) => (
              <details
                className="group rounded-[14px] border-2 border-line bg-raised"
                key={guide.name}
                open={
                  platform === "android" && guide.name.startsWith("Gmail")
                    ? true
                    : undefined
                }
              >
                {/* Below lg the whole 48px row toggles, with a chevron; wide
                    screens keep the native marker, so they look as before. */}
                <summary className="min-h-12 cursor-pointer p-4 text-sm font-extrabold text-ink max-lg:flex max-lg:list-none max-lg:items-center max-lg:justify-between max-lg:gap-3 max-lg:[&::-webkit-details-marker]:hidden">
                  {guide.name}
                  <ChevronDown
                    aria-hidden
                    className="size-5 shrink-0 text-subtle transition-transform duration-[var(--dur-fast)] group-open:rotate-180 lg:hidden"
                  />
                </summary>
                <div className="px-4 pb-4">
                  {guide.note && (
                    <p className="text-sm text-subtle">{guide.note}</p>
                  )}
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink first:mt-0">
                    {guide.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
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
    </AdminPage>
  );
}
