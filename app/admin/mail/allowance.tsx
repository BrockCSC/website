"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { MailAllowance } from "@/lib/mail/limit";
import { toast } from "@/components/ui/toast";
import { ask } from "../ask";

/** The daily send allowance, fetched once per `refresh` tick. */
export function useAllowance(enabled: boolean, refresh: number) {
  const [state, setState] = useState<MailAllowance | null>(null);

  const load = useCallback(() => {
    fetch("/api/mail/limit")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MailAllowance | null) => data && setState(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load, refresh]);

  return { state: enabled ? state : null, reload: load };
}

export type AllowanceProps = {
  state: MailAllowance | null;
  reload: () => void;
};

const isLow = (state: MailAllowance) =>
  state.remaining <= Math.max(5, Math.ceil(state.limit / 10));

const pendingOf = (state: MailAllowance) => state.request?.status === "pending";

const postRequest = async (requested: number, reason: string) => {
  const res = await fetch("/api/mail/limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requested, reason }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => ({}))) as { error?: string };
  return res?.ok ? null : (body.error ?? "Could not send that request.");
};

/** Phone: the request form as two input asks (16px, numeric keypad first). */
export async function requestMoreSends(
  state: MailAllowance,
  reload: () => void,
) {
  const wanted = await ask({
    title: "Request more sends",
    detail: `You can send ${state.limit} a day. How many do you need?`,
    placeholder: `More than ${state.limit}`,
    confirmLabel: "Next",
    withInput: true,
    required: true,
    inputMode: "numeric",
  });
  if (wanted === null) return;
  const requested = Number(wanted.trim());
  if (!(requested > state.limit)) {
    toast({ tone: "error", message: `Ask for more than ${state.limit}.` });
    return;
  }
  const reason = await ask({
    title: "What is it for?",
    detail: "A co-president approves the new limit.",
    placeholder: "What it is for",
    confirmLabel: "Ask",
    withInput: true,
    required: true,
  });
  if (reason === null) return;
  const error = await postRequest(requested, reason);
  if (error) {
    toast({ tone: "error", message: error });
    return;
  }
  toast({ message: `Asked for ${requested} a day.` });
  reload();
}

/** Desk: the card in the mail sidebar. */
export function Allowance({ state, reload }: AllowanceProps) {
  const [asking, setAsking] = useState(false);
  const [wanted, setWanted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  if (!state || state.exempt) return null;

  const pending = pendingOf(state);
  const low = isLow(state);

  const tooSmall = !(Number(wanted) > state.limit);

  const submit = async () => {
    setError(null);
    setAsked(true);
    const failure = await postRequest(Number(wanted), reason);
    setAsked(false);
    if (failure) {
      setError(failure);
      return;
    }
    setAsking(false);
    setWanted("");
    setReason("");
    reload();
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
              className="w-full rounded-[8px] border-2 border-line bg-raised px-2 py-1 text-base text-ink outline-none focus:border-brand pointer-fine:text-xs"
              inputMode="numeric"
              onChange={(event) => setWanted(event.target.value)}
              placeholder={`More than ${state.limit}`}
              value={wanted}
            />
            <input
              aria-label="Why you need more"
              className="w-full rounded-[8px] border-2 border-line bg-raised px-2 py-1 text-base text-ink outline-none placeholder:text-subtle focus:border-brand pointer-fine:text-xs"
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

/** Mailboxes sheet footer: "4 of 50 left today", a slim bar and Request more. */
export function AllowanceMeter({ state, reload }: AllowanceProps) {
  if (!state || state.exempt) return null;
  const pending = pendingOf(state);
  const used = Math.min(1, state.used / Math.max(1, state.limit));
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-line"
        >
          <Send className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">
            {state.remaining} of {state.limit} left today
          </p>
          <div
            role="meter"
            aria-label="Sends used today"
            aria-valuemin={0}
            aria-valuemax={state.limit}
            aria-valuenow={state.used}
            className="mt-1.5 h-2 overflow-hidden rounded-full border-2 border-line bg-raised"
          >
            <div
              className={`h-full ${isLow(state) ? "bg-brand" : "bg-ink"}`}
              style={{ width: `${Math.round(used * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-subtle">
            {pending
              ? `Asked for ${state.request?.requested} a day, waiting on a co-president`
              : "Resets at midnight"}
          </p>
        </div>
      </div>
      {!pending && (
        <button
          type="button"
          onClick={() => void requestMoreSends(state, reload)}
          className="press-flat mt-2 flex min-h-11 w-full items-center justify-center rounded-[10px] border-2 border-line font-bold text-ink"
        >
          Request more
        </button>
      )}
    </li>
  );
}

/** Phone list: one line at the top, only when running low. */
export function AllowanceWarning({ state, reload }: AllowanceProps) {
  if (!state || state.exempt || !isLow(state)) return null;
  const pending = pendingOf(state);
  return (
    <div className="flex min-h-11 items-center gap-2 border-b-2 border-line bg-tint pr-2 pl-4 text-sm font-bold text-ink desk:hidden">
      <p className="min-w-0 flex-1 truncate">
        {state.remaining > 0
          ? `${state.remaining} ${state.remaining === 1 ? "send" : "sends"} left today`
          : "No sends left today"}
        {pending && " · request pending"}
      </p>
      {!pending && (
        <button
          type="button"
          onClick={() => void requestMoreSends(state, reload)}
          className="press-flat min-h-11 shrink-0 rounded-[10px] px-2 font-extrabold text-ink underline underline-offset-2"
        >
          Request more
        </button>
      )}
    </div>
  );
}
