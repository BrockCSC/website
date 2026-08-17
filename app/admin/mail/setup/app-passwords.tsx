"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { field, labelClass } from "../../users/ui";

type AppPassword = {
  id: string;
  description: string;
  createdAt: string;
};

const created = (value: string) => {
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

export function AppPasswords() {
  const [list, setList] = useState<AppPassword[] | null>(null);
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const res = await fetch("/api/mail/app-passwords");
    setList(res.ok ? ((await res.json()) as AppPassword[]) : []);
  };

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch {
        setList([]);
      }
    })();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const res = await fetch("/api/mail/app-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        secret?: string;
        error?: string;
      };
      if (!res.ok || !data.secret) {
        throw new Error(data.error ?? "Could not create that.");
      }
      setSecret(data.secret);
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    await fetch(`/api/mail/app-passwords/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null);
    await load().catch(() => {});
    setBusy(false);
  };

  return (
    <div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
        <div className="min-w-[220px] flex-1">
          <label className={labelClass} htmlFor="app-password-name">
            What is it for?
          </label>
          <input
            className={field}
            id="app-password-name"
            maxLength={60}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="iPhone Mail"
            value={description}
          />
        </div>
        <Button disabled={busy || !description.trim()} type="submit">
          {busy ? "Working..." : "Create"}
        </Button>
      </form>

      {error && (
        <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>
      )}

      {secret && (
        <div className="mt-4 rounded-[14px] border-2 border-brand bg-tint p-4">
          <p className="text-sm font-bold text-ink">
            Copy this now. It is not shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 break-all rounded-[10px] border-2 border-line bg-surface px-3 py-2 font-mono text-sm text-ink">
              {secret}
            </code>
            <Button
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(secret)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">
            Paste it into your mail app as the password. If you lose it, revoke
            it here and make another.
          </p>
        </div>
      )}

      <div className="mt-5">
        {list === null ? (
          <p className="text-sm text-subtle">Loading...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-subtle">
            You have not made one yet. Create one per device, so losing a phone
            costs you only that phone.
          </p>
        ) : (
          <ul className="divide-y-2 divide-line border-t-2 border-line">
            {list.map((one) => (
              <li
                key={one.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">
                    {one.description}
                  </span>
                  {created(one.createdAt) && (
                    <span className="block text-xs text-subtle">
                      Added {created(one.createdAt)}
                    </span>
                  )}
                </span>
                <Button
                  disabled={busy}
                  onClick={() => void revoke(one.id)}
                  size="xs"
                  type="button"
                  variant="destructive"
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
