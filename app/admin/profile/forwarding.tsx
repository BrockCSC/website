"use client";

import { useEffect, useState } from "react";
import {
  fetchMailForwarding,
  updateMailForwarding,
  type MailForwardingView,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type { MailForwardingBlocker } from "@/lib/api/types";
import { Panel } from "../users/ui";

const BLOCKED: Record<MailForwardingBlocker, string> = {
  "no-mailbox": "You don't have a club mailbox, so there's nothing to forward.",
  "read-only":
    "Your mailbox is read-only, so it can't forward mail. Ask a co-president if that's wrong.",
  "no-personal-email":
    "There's no personal email on your account. Ask a co-president to add one.",
  "club-address":
    "The email on your account is a club address. Ask a co-president to set a personal one.",
};

export function MailForwarding() {
  const [view, setView] = useState<MailForwardingView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMailForwarding()
      .then(setView)
      .catch(() =>
        setError(
          "Couldn't load your forwarding setting. Refresh to try again.",
        ),
      );
  }, []);

  if (!view) {
    return error ? (
      <Panel accent title="Email forwarding">
        <p className="text-sm font-bold text-destructive">{error}</p>
      </Panel>
    ) : null;
  }
  if (view.blocker === "no-mailbox") return null;

  const locked = !!view.blocker && !view.enabled;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      setView(await updateMailForwarding(enabled));
    } catch (err) {
      setError(
        (err instanceof ApiError && err.detail) ||
          "Couldn't change forwarding. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      accent
      note="Private to you. It isn't shown on your team page card."
      title="Email forwarding"
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          checked={view.enabled}
          className="check mt-0.5"
          disabled={saving || locked}
          onChange={(e) => void toggle(e.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="font-bold text-ink">
            Forward my club email to {view.personalEmail ?? "my personal email"}
          </span>
          <span className="block text-subtle">
            A copy of everything that reaches {view.clubAddress} is sent on to
            your personal inbox, and the original stays in your club mailbox.
            Forwarded mail shows as from &ldquo;Sender via BrockCSC&rdquo;;
            replying goes straight to the original sender. Spam isn&apos;t
            forwarded.
          </span>
        </span>
      </label>
      {view.blocker && (
        <p className="mt-3 text-xs font-bold text-subtle">
          {BLOCKED[view.blocker]}
        </p>
      )}
      {view.rehearsed && (
        <p className="mt-3 text-xs font-bold text-subtle">
          This environment shares the live mail server, so the switch isn&apos;t
          applied here. It only takes effect on production.
        </p>
      )}
      {saving && (
        <p className="mt-3 text-xs font-bold text-subtle">Saving...</p>
      )}
      {error && (
        <p className="mt-3 text-sm font-bold text-destructive">{error}</p>
      )}
    </Panel>
  );
}
