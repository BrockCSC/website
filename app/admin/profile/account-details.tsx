"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  abortMigration,
  fetchMigration,
  fetchOwnDetails,
  handoffMigrationSession,
  startRename,
  updateOwnDetails,
  type IdentityMigrationView,
  type OwnDetails,
  type RenamePreview,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { usernameFor } from "@/lib/auth/username";
import { EMAIL_PATTERN, STUDENT_ID_PATTERN } from "@/lib/signups/validation";
import { ask } from "../ask";
import Confirm from "../users/confirm";
import MigrationSteps, { statusLabel } from "../users/migration-steps";
import { Note, Panel, Pill, fieldOn, labelClass } from "../users/ui";

const POLL_MS = 2_500;
const field = fieldOn("bg-surface");

type Form = {
  firstName: string;
  lastName: string;
  email: string;
  studentId: string;
};

const formFor = (details: OwnDetails | null): Form => ({
  firstName: details?.firstName ?? "",
  lastName: details?.lastName ?? "",
  email: details?.email ?? "",
  studentId: details?.studentId ?? "",
});

/**
 * Polls the member's own rename. At cut-over it asks the server to swap the
 * session for the new login, then reloads; if that is not possible it sends
 * them back to sign in.
 */
function MigrationProgress({
  id,
  onLeave,
}: {
  id: string;
  onLeave: () => void;
}) {
  const [migration, setMigration] = useState<IdentityMigrationView | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aborting, setAborting] = useState(false);
  const handedOff = useRef(false);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const next = await fetchMigration(id);
        if (stopped) return;
        setMigration(next);
        const ready =
          next.mode === "real" &&
          next.requestedBy === "self" &&
          ["cut-over", "done"].includes(next.status) &&
          !next.handoff;
        if (ready && !handedOff.current) {
          handedOff.current = true;
          const result = await handoffMigrationSession(id);
          // A full reload, not a router push: the session provider and its
          // role stream have to reopen under the new login (or the sign-in form).
          if (result.signedIn) {
            setNote(`Signed back in as ${result.username}. Reloading...`);
            setTimeout(() => window.location.reload(), 1_500);
          } else if (result.relogin) {
            setNote(
              `Sign in again as ${result.username} with your usual password.`,
            );
            setTimeout(() => window.location.reload(), 4_000);
          }
        }
      } catch (err) {
        if (stopped) return;
        setError(
          err instanceof ApiError && err.status === 401
            ? "Your session has ended. Sign in again with your new username."
            : "Lost track of the change. Refresh to check on it.",
        );
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id]);

  const finished =
    migration &&
    (migration.mode === "rehearsal" ||
      migration.status === "done" ||
      migration.status === "aborted");

  return (
    <div className="flex flex-col gap-4">
      {migration ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-ink">
              {migration.from} → {migration.to}
            </span>
            <Pill tone={migration.status === "failed" ? "accent" : "flat"}>
              {statusLabel(migration)}
            </Pill>
          </div>
          {migration.mode === "rehearsal" && (
            <Note>
              Rehearsed only: this environment shares the live Keycloak realm
              and mail server, so nothing was changed. In production every step
              below would run.
            </Note>
          )}
          {migration.status === "failed" && (
            <Note>
              The change stopped and the co-presidents have been emailed.
              Nothing has been deleted; they can resume it once the cause is
              fixed.
            </Note>
          )}
          {migration.aborting && (
            <Note>
              Abort requested. The change stops at its next step and the new
              login and mailbox are removed; nothing of yours has changed.
            </Note>
          )}
          {migration.requestedBy === "approver" &&
            migration.handoff?.how === "relogin" && (
              <Note>
                Your account is now {migration.to}. Sign out and back in with
                the temporary password a co-president gave you.
              </Note>
            )}
          <MigrationSteps migration={migration} />
        </>
      ) : (
        !error && <p className="text-sm text-subtle">Checking on it...</p>
      )}
      {note && <Note>{note}</Note>}
      {error && (
        <span className="text-sm font-bold text-destructive">{error}</span>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {migration?.canAbort && migration.mode === "real" && (
          <Button
            disabled={aborting}
            onClick={async () => {
              const ok = await ask({
                title: "Abort the username change?",
                detail:
                  "Nothing has been taken away yet, so this simply removes the new login and mailbox that were being prepared.",
                confirmLabel: "Abort",
                destructive: true,
              });
              if (ok === null) return;
              setAborting(true);
              try {
                setMigration(await abortMigration(id));
              } catch (err) {
                setError(
                  (err instanceof ApiError && err.detail) ||
                    "Could not abort it.",
                );
              } finally {
                setAborting(false);
              }
            }}
            size="sm"
            type="button"
            variant="destructive"
          >
            {aborting ? "Aborting..." : "Abort"}
          </Button>
        )}
        {finished && (
          <Button onClick={onLeave} size="sm" type="button" variant="secondary">
            Back to your details
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AccountDetails() {
  const [details, setDetails] = useState<OwnDetails | null>(null);
  const [form, setForm] = useState<Form>(formFor(null));
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<RenamePreview | null>(null);
  const [migrationId, setMigrationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchOwnDetails();
      setDetails(next);
      setForm(formFor(next));
      setMigrationId(next.pendingMigrationId);
      setError(null);
    } catch {
      setError("Couldn't load your account details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  if (loading) return null;

  if (migrationId) {
    return (
      <Panel
        accent
        note="Your username is being changed. Keep this page open; you'll be signed back in when it's done."
        title="Account details"
      >
        <MigrationProgress
          id={migrationId}
          onLeave={() => {
            setMigrationId(null);
            setLoading(true);
            void load();
          }}
        />
      </Panel>
    );
  }

  if (!details?.username) {
    return (
      <Panel accent title="Account details">
        <p className="text-sm text-subtle">
          {error ?? "No sign-up record is linked to this login."}
        </p>
      </Panel>
    );
  }

  const trimmed = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    studentId: form.studentId.trim(),
  };
  const namesChanged =
    trimmed.firstName !== details.firstName ||
    trimmed.lastName !== details.lastName;
  const emailChanged = trimmed.email !== details.email;
  const identityChanged = namesChanged || emailChanged;
  const dirty = identityChanged || trimmed.studentId !== details.studentId;
  const base =
    trimmed.firstName && trimmed.lastName
      ? usernameFor(trimmed.firstName, trimmed.lastName)
      : "";
  const wouldRename = namesChanged && base !== details.username;
  const problems = [
    !trimmed.firstName || !trimmed.lastName ? "a first and last name" : "",
    trimmed.email && !EMAIL_PATTERN.test(trimmed.email) ? "the email" : "",
    trimmed.studentId && !STUDENT_ID_PATTERN.test(trimmed.studentId)
      ? "the student number"
      : "",
    identityChanged && !password ? "your current password" : "",
  ].filter(Boolean);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || problems.length) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateOwnDetails({
        ...(namesChanged
          ? { firstName: trimmed.firstName, lastName: trimmed.lastName }
          : {}),
        ...(emailChanged ? { email: trimmed.email } : {}),
        ...(trimmed.studentId !== details.studentId
          ? { studentId: trimmed.studentId }
          : {}),
        ...(identityChanged ? { currentPassword: password } : {}),
      });
      if ("saved" in result) {
        setDetails(result.saved);
        setForm(formFor(result.saved));
        setPassword("");
        setSaved(true);
      } else if ("rename" in result) {
        setPreview(result.rename);
      } else {
        setError(result.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    setError(null);
    try {
      const started = await startRename({
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
        currentPassword: password,
      });
      setPassword("");
      setPreview(null);
      setMigrationId(started.migrationId);
    } catch (err) {
      setPreview(null);
      setError(
        (err instanceof ApiError && err.detail) ||
          "Could not start the change.",
      );
    }
  };

  return (
    <Panel
      accent
      note="Your name, contact email and student number. Changing your name or email needs your current password."
      title="Account details"
    >
      {preview ? (
        <Confirm
          confirmLabel={preview.rehearsal ? "Rehearse" : "Change my username"}
          intro={
            preview.rehearsal
              ? "This environment only rehearses: nothing below would actually happen here."
              : `Your new name changes your username to ${preview.to}. This is everything that happens; it takes a few minutes and cannot be undone once the old login is disabled.`
          }
          items={preview.preview}
          onApply={rename}
          onCancel={() => setPreview(null)}
          title={`Become ${preview.to}`}
        />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {details.passwordResetRequired && (
            <Note>
              Choose your own password first; a temporary one can&apos;t be used
              to change your name or email.
            </Note>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="own-first-name">
                First name
              </label>
              <input
                className={field}
                id="own-first-name"
                maxLength={60}
                onChange={(e) => set("firstName", e.target.value)}
                required
                value={form.firstName}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="own-last-name">
                Last name
              </label>
              <input
                className={field}
                id="own-last-name"
                maxLength={60}
                onChange={(e) => set("lastName", e.target.value)}
                required
                value={form.lastName}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="own-email">
                Personal email
              </label>
              <input
                className={field}
                id="own-email"
                onChange={(e) => set("email", e.target.value)}
                required
                type="email"
                value={form.email}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="own-student-id">
                Student number
              </label>
              <input
                className={field}
                id="own-student-id"
                inputMode="numeric"
                onChange={(e) =>
                  set("studentId", e.target.value.replace(/\D/g, ""))
                }
                placeholder="Leave blank if you no longer have one"
                value={form.studentId}
              />
            </div>
          </div>

          <div className="text-sm text-subtle">
            Username{" "}
            <span className="font-mono text-ink">{details.username}</span> ·{" "}
            <span className="font-mono text-ink">{details.address}</span>
            {details.previousUsernames.length > 0 && (
              <span> (was {details.previousUsernames.join(", ")})</span>
            )}
          </div>
          {wouldRename && (
            <Note>
              That name changes your username
              {base ? (
                <>
                  {" "}
                  to <span className="font-mono">{base}</span>
                </>
              ) : (
                ""
              )}
              . Saving shows you everything that involves before anything
              happens.
            </Note>
          )}

          {identityChanged && (
            <div className="max-w-xs animate-rise-in">
              <label className={labelClass} htmlFor="own-current-password">
                Current password
              </label>
              <input
                autoComplete="current-password"
                className={field}
                id="own-current-password"
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                value={password}
              />
              <p className="mt-1 text-xs text-subtle">
                Needed to change your name or email. A notice goes to your old
                and new addresses.
              </p>
            </div>
          )}

          <div className="flex min-h-[42px] flex-wrap items-center gap-3">
            {dirty ? (
              <>
                <Button
                  disabled={
                    saving ||
                    problems.length > 0 ||
                    details.passwordResetRequired
                  }
                  size="sm"
                  type="submit"
                  variant="primary"
                >
                  {saving
                    ? "Saving..."
                    : wouldRename
                      ? "Review the change..."
                      : "Save details"}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setForm(formFor(details));
                    setPassword("");
                    setError(null);
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Discard
                </Button>
                {problems.length > 0 && (
                  <span className="text-sm font-bold text-subtle">
                    Enter {problems.join(" and ")} first.
                  </span>
                )}
              </>
            ) : (
              saved && (
                <span className="animate-fade-in text-sm font-bold text-brand">
                  Saved
                </span>
              )
            )}
            {error && (
              <span className="text-sm font-bold text-destructive">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}
