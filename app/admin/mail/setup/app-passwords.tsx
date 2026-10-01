"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { ask } from "../../ask";
import { field, labelClass } from "../../users/ui";

type AppPassword = {
  id: string;
  description: string;
  createdAt: string;
};

// Touch or below lg: the quieter outline Revoke (spec D21). Wide fine-pointer
// desktop keeps its look.
const QUIET_REVOKE = "(max-width: 1023.98px), (pointer: coarse)";

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

const readError = async (res: Response, fallback: string) => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
};

export function AppPasswords({
  endpoint = "/api/mail/app-passwords",
  inputId = "app-password-name",
  onSecret,
}: {
  endpoint?: string;
  /** Id of the name field (the setup page links to it). */
  inputId?: string;
  /** A new password was made and shown. */
  onSecret?: () => void;
}) {
  const [list, setList] = useState<AppPassword[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
  const secretRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const quiet = useMediaQuery(QUIET_REVOKE);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error();
      setList((await res.json()) as AppPassword[]);
      setLoadError(null);
    } catch {
      setLoadError("Could not load your app passwords.");
    }
  }, [endpoint]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || creating) return;
    setCreating(true);
    setError(null);
    setSecret(null);
    clearTimeout(copyTimer.current);
    setCopy("idle");
    try {
      const res = await fetch(endpoint, {
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
      onSecret?.();
      // Drop the keyboard, then show the one-time secret where it can be
      // read and copied (settings-14).
      (document.activeElement as HTMLElement | null)?.blur();
      requestAnimationFrame(() =>
        secretRef.current?.scrollIntoView({ block: "center" }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that.");
    } finally {
      setCreating(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    clearTimeout(copyTimer.current);
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(secret);
      setCopy("copied");
      copyTimer.current = setTimeout(() => setCopy("idle"), 2000);
    } catch {
      // Select it so a long press (or Ctrl+C) copies it.
      const code = codeRef.current;
      const selection = window.getSelection();
      if (code && selection) {
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopy("manual");
    }
  };

  const revoke = async (one: AppPassword) => {
    const ok = await ask({
      title: `Revoke "${one.description}"?`,
      detail: "Mail apps using it stop syncing right away.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok === null) return;
    setBusyId(one.id);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(one.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await readError(res, "Could not revoke that."));
      }
      await load();
      toast({ message: `Revoked "${one.description}".` });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not revoke that.";
      setError(message);
      toast({ tone: "error", message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-3 max-sm:flex-col max-sm:items-stretch"
        onSubmit={create}
      >
        <div className="min-w-[220px] flex-1">
          <label className={labelClass} htmlFor={inputId}>
            What is it for?
          </label>
          <input
            autoComplete="off"
            className={field}
            enterKeyHint="done"
            id={inputId}
            maxLength={60}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="iPhone Mail"
            value={description}
          />
        </div>
        <Button disabled={creating || !description.trim()} type="submit">
          {creating ? "Working..." : "Create"}
        </Button>
      </form>

      {error && (
        <p className="mt-2 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      {secret && (
        <div
          className="mt-4 scroll-mt-4 rounded-[14px] border-2 border-brand bg-tint p-4"
          ref={secretRef}
        >
          <p className="text-sm font-bold text-ink">
            Copy this now. It won&apos;t be shown again.
          </p>
          <code
            className="mt-2 block rounded-[10px] border-2 border-line bg-surface px-3 py-2 font-mono text-lg tracking-wider wrap-anywhere text-ink select-all"
            ref={codeRef}
          >
            {secret}
          </code>
          <Button
            className="mt-3 w-full pointer-coarse:min-h-12"
            onClick={() => void copySecret()}
            type="button"
            variant="secondary"
          >
            {copy === "copied" ? (
              <>
                <Check aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy aria-hidden /> Copy password
              </>
            )}
          </Button>
          <p aria-live="polite" className="mt-2 text-xs text-subtle">
            {copy === "copied"
              ? "Copied. Paste it into your mail app as the password."
              : copy === "manual"
                ? "Couldn't copy automatically. It's selected: press and hold to copy."
                : "Paste it into your mail app as the password. If you lose it, revoke it here and make another."}
          </p>
        </div>
      )}

      <div className="mt-5">
        {loadError && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-ink" role="alert">
              {loadError}
            </p>
            <Button
              className="pointer-coarse:min-h-11"
              onClick={() => void load()}
              size="sm"
              type="button"
              variant="secondary"
            >
              Retry
            </Button>
          </div>
        )}
        {list === null ? (
          loadError ? null : (
            <p className="text-sm text-subtle">Loading...</p>
          )
        ) : list.length === 0 ? (
          <p className="text-sm text-subtle">
            You have not made one yet. Create one per device, so losing a phone
            costs you only that phone.
          </p>
        ) : (
          <ul className="divide-y-2 divide-line border-t-2 border-line">
            {list.map((one) => (
              <li
                className="flex min-h-14 flex-nowrap items-center gap-3 py-2.5"
                key={one.id}
              >
                <span className="min-w-0 flex-1">
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
                  aria-label={`Revoke ${one.description}`}
                  disabled={busyId !== null}
                  onClick={() => void revoke(one)}
                  size={quiet ? "sm" : "xs"}
                  type="button"
                  variant={quiet ? "outline-destructive" : "destructive"}
                >
                  {busyId === one.id ? "Revoking…" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
