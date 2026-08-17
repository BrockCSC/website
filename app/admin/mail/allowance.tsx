"use client";

import { useCallback, useEffect, useState } from "react";
import type { MailAllowance } from "@/lib/mail/limit";

export function Allowance({ refresh }: { refresh: number }) {
  const [state, setState] = useState<MailAllowance | null>(null);
  const [asking, setAsking] = useState(false);
  const [wanted, setWanted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  const load = useCallback(() => {
    fetch("/api/mail/limit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MailAllowance | null) => data && setState(data))
      .catch(() => {});
  }, []);

  useEffect(load, [load, refresh]);

  if (!state || state.exempt) return null;

  const pending = state.request?.status === "pending";
  const low = state.remaining <= Math.max(5, Math.ceil(state.limit / 10));

  const tooSmall = !(Number(wanted) > state.limit);

  const submit = async () => {
    setError(null);
    setAsked(true);
    const res = await fetch("/api/mail/limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested: Number(wanted), reason }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string };
    setAsked(false);
    if (!res?.ok) {
      setError(body.error ?? "Could not send that request.");
      return;
    }
    setAsking(false);
    setWanted("");
    setReason("");
    load();
  };

  return (
    <div className="shrink-0 rounded-[10px] border-2 border-line bg-surface p-3 shadow-brut-sm">
      <p className="text-xs font-bold text-ink">
        {state.used} of {state.limit} sent today
      </p>
      <p className="mt-0.5 text-xs text-subtle">
        {state.remaining > 0
          ? `${state.remaining} left, resets at midnight`
          : "Limit reached, resets at midnight"}
      </p>

      {pending ? (
        <p className="mt-2 text-xs font-bold text-brand">
          Asked for {state.request?.requested} a day — waiting on a
          co-president.
        </p>
      ) : (
        low &&
        (asking ? (
          <div className="mt-2 space-y-2">
            <input
              aria-label="Messages a day"
              className="w-full rounded-[8px] border-2 border-line bg-raised px-2 py-1 text-xs text-ink outline-none focus:border-brand"
              inputMode="numeric"
              onChange={(event) => setWanted(event.target.value)}
              placeholder={`More than ${state.limit}`}
              value={wanted}
            />
            <input
              aria-label="Why you need more"
              className="w-full rounded-[8px] border-2 border-line bg-raised px-2 py-1 text-xs text-ink outline-none placeholder:text-subtle focus:border-brand"
              onChange={(event) => setReason(event.target.value)}
              placeholder="What it is for"
              value={reason}
            />
            {error && <p className="text-xs font-bold text-brand">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={asked || tooSmall}
                title={
                  tooSmall ? `Ask for more than ${state.limit}.` : undefined
                }
                onClick={() => void submit()}
                className="flex-1 rounded-[8px] border-2 border-line bg-brand px-2 py-1 text-xs font-bold text-brand-ink shadow-brut-sm hover:opacity-90 disabled:opacity-50"
              >
                {asked ? "Asking…" : "Ask"}
              </button>
              <button
                type="button"
                disabled={asked}
                onClick={() => setAsking(false)}
                className="rounded-[8px] border-2 border-line px-2 py-1 text-xs font-bold text-ink hover:bg-tint disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="mt-2 w-full rounded-[8px] border-2 border-line bg-tint px-2 py-1 text-xs font-bold text-ink hover:bg-raised"
          >
            Request more
          </button>
        ))
      )}
    </div>
  );
}
