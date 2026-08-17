"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { signup } from "@/lib/api";
import { usernameFor } from "@/lib/auth/username";

const BLANK = {
  inviteCode: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  studentId: "",
  isFormerExec: false,
  password: "",
  confirmPassword: "",
};

type Form = typeof BLANK;
type Errors = Partial<Record<keyof Form, string>>;
type Submitted = {
  confirmationCode: string;
  username: string;
  mailbox?: string;
};

const STORE_KEY = "brockcsc:signup";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BROCK_EMAIL_PATTERN = /@(?:[a-z0-9-]+\.)*brocku\.ca$/i;
const STUDENT_ID_PATTERN = /^\d{6,10}$/;

const problems = (form: Form): Errors => {
  const found: Errors = {};
  const email = form.email.trim();
  const studentId = form.studentId.trim();

  if (!form.inviteCode.trim()) {
    found.inviteCode = "Ask a current exec for this week's code.";
  }
  if (!form.firstName.trim()) found.firstName = "Required.";
  if (!form.lastName.trim()) found.lastName = "Required.";
  if (!EMAIL_PATTERN.test(email)) {
    found.email = "Enter a valid email address.";
  } else if (!form.isFormerExec && !BROCK_EMAIL_PATTERN.test(email)) {
    found.email =
      "Use your @brocku.ca email, or tick that you are a former executive.";
  }
  if (
    form.isFormerExec
      ? studentId && !STUDENT_ID_PATTERN.test(studentId)
      : !STUDENT_ID_PATTERN.test(studentId)
  ) {
    found.studentId = "Your student number, 6 to 10 digits.";
  }
  if (form.password.length < 8) {
    found.password = "Use at least 8 characters.";
  } else if (form.confirmPassword !== form.password) {
    found.confirmPassword = "Passwords do not match.";
  }
  return found;
};

const remember = (result: Submitted | null) => {
  try {
    if (result) sessionStorage.setItem(STORE_KEY, JSON.stringify(result));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    return;
  }
};

const noSubscribe = () => () => {};

const readStore = (): string | null => {
  try {
    return sessionStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};

const parse = (raw: string | null): Submitted | null => {
  try {
    return raw ? (JSON.parse(raw) as Submitted) : null;
  } catch {
    return null;
  }
};

const Field = ({
  id,
  label,
  optional,
  hint,
  error,
  ...props
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
} & React.ComponentProps<"input">) => (
  <div>
    <label className="mb-1 block text-sm font-bold" htmlFor={id}>
      {label}
      {optional && <span className="font-normal text-subtle"> (optional)</span>}
    </label>
    <input
      id={id}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      aria-invalid={error ? true : undefined}
      className={`w-full rounded-[10px] border-2 bg-surface px-3 py-2 text-ink ${
        error ? "border-destructive" : "border-line"
      }`}
      {...props}
    />
    {error ? (
      <p
        className="mt-1 text-sm font-semibold text-destructive"
        id={`${id}-error`}
      >
        {error}
      </p>
    ) : (
      hint && (
        <p className="mt-1 text-xs text-subtle" id={`${id}-hint`}>
          {hint}
        </p>
      )
    )}
  </div>
);

export default function SignupPage() {
  const [form, setForm] = useState<Form>(BLANK);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [override, setOverride] = useState<{ value: Submitted | null } | null>(
    null,
  );
  const [copied, setCopied] = useState<boolean | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const stored = useSyncExternalStore(noSubscribe, readStore, () => null);
  const submitted = override ? override.value : parse(stored);
  const done = !!submitted;

  useEffect(() => {
    (done ? headingRef : errorRef).current?.focus();
  }, [done, error]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value =
      key === "inviteCode" ? e.target.value.toUpperCase() : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const former = form.isFormerExec;
  const username = usernameFor(form.firstName, form.lastName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const found = problems(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await signup(form);
      remember(result);
      setOverride({ value: result });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Nothing was submitted — try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    remember(null);
    setOverride({ value: null });
    setCopied(null);
    setForm(BLANK);
  };

  const copy = () => {
    if (!navigator.clipboard) return setCopied(false);
    navigator.clipboard
      .writeText(submitted?.confirmationCode ?? "")
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      {submitted ? (
        <div className="animate-pop-in w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8">
          <h1
            className="text-center text-2xl font-extrabold text-brand"
            ref={headingRef}
            tabIndex={-1}
          >
            Request submitted
          </h1>
          <p className="mt-2 text-center text-sm text-subtle">
            Your account{" "}
            <span className="font-bold text-ink">{submitted.username}</span> is
            waiting for a co-president to approve it.
          </p>

          <div className="my-6 rounded-[12px] border-2 border-line bg-tint p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Your confirmation code
            </div>
            <div className="my-1 break-all text-3xl font-extrabold tracking-[0.25em] text-brand">
              {submitted.confirmationCode}
            </div>
            <Button onClick={copy} size="sm" type="button" variant="outline">
              {copied ? "Copied" : "Copy code"}
            </Button>
            {copied === false && (
              <p className="mt-2 text-xs text-subtle">
                Copying failed — select the code above and copy it by hand.
              </p>
            )}
            <p className="mt-3 text-xs text-subtle">
              Give this to the co-president approving you, so they know it is
              really you. It is shown once and cannot be sent to you again.
            </p>
          </div>

          <h2 className="text-sm font-bold">What happens next</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-subtle">
            <li>A co-president checks that code with you.</li>
            <li>
              They approve your account by hand, usually within a few days.
            </li>
            <li>
              Sign in at{" "}
              <Link className="underline" href="/admin">
                /admin
              </Link>{" "}
              as{" "}
              <span className="font-bold text-ink">{submitted.username}</span>{" "}
              with the password you just chose.
              {submitted.mailbox && (
                <>
                  {" "}
                  Your mailbox{" "}
                  <span className="font-bold text-ink">
                    {submitted.mailbox}
                  </span>{" "}
                  is created at the same time.
                </>
              )}
            </li>
          </ol>
          <p className="mt-3 text-xs text-subtle">
            Nothing is emailed to you when it is approved, so try signing in.
            Chase a co-president if a week goes by.
          </p>

          <Button
            className="mt-6 w-full"
            onClick={startOver}
            type="button"
            variant="outline"
          >
            Start another request
          </Button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit}
          className="animate-rise-in w-full max-w-md rounded-[20px] border-2 border-line bg-surface p-6 shadow-brut sm:p-8"
        >
          <h1 className="mb-1 text-center text-2xl font-extrabold text-brand">
            Request an exec account
          </h1>
          <p className="mb-6 text-center text-sm text-subtle">
            A co-president approves it by hand, usually within a few days. You
            cannot sign in until then.
          </p>

          <div className="flex flex-col gap-4">
            <Field
              id="inviteCode"
              label="Invite code"
              hint="This week's code, from a current exec."
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={form.inviteCode}
              error={errors.inviteCode}
              onChange={set("inviteCode")}
              autoFocus
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="firstName"
                label="First name"
                autoComplete="given-name"
                maxLength={60}
                value={form.firstName}
                error={errors.firstName}
                onChange={set("firstName")}
                required
              />
              <Field
                id="lastName"
                label="Last name"
                autoComplete="family-name"
                maxLength={60}
                value={form.lastName}
                error={errors.lastName}
                onChange={set("lastName")}
                required
              />
            </div>

            {username && (
              <p className="text-sm text-subtle">
                You will sign in as{" "}
                <span className="font-bold text-brand">{username}</span>
                {former ? "" : ", and get the matching club mailbox"}. If that
                name is taken we add a number, and tell you which one you got.
              </p>
            )}

            <label className="mb-4 flex items-start gap-2 text-sm">
              <input
                checked={former}
                className="check mt-0.5"
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    isFormerExec: e.target.checked,
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    email: undefined,
                    studentId: undefined,
                  }));
                }}
                type="checkbox"
              />
              <span>
                I&apos;m a former executive
                <span className="block text-subtle">
                  Alumni no longer have a Brock email or student number, so
                  those become optional.
                </span>
              </span>
            </label>

            <Field
              id="email"
              label={former ? "Email" : "Brock email"}
              type="email"
              autoComplete="email"
              maxLength={200}
              placeholder={former ? undefined : "you@brocku.ca"}
              hint={former ? undefined : "Must end in @brocku.ca."}
              value={form.email}
              error={errors.email}
              onChange={set("email")}
              required
            />
            <Field
              id="studentId"
              label="Student number"
              inputMode="numeric"
              maxLength={10}
              optional={former}
              value={form.studentId}
              error={errors.studentId}
              onChange={set("studentId")}
              required={!former}
            />
            <Field
              id="phone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              maxLength={30}
              optional
              value={form.phone}
              onChange={set("phone")}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              value={form.password}
              error={errors.password}
              onChange={set("password")}
              required
            />
            <Field
              id="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              error={errors.confirmPassword}
              onChange={set("confirmPassword")}
              required
            />
          </div>

          {error && (
            <p
              className="mt-4 rounded-[10px] border-2 border-destructive p-3 text-sm font-semibold text-destructive"
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {error} Nothing you typed was lost.
            </p>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Request account"}
          </Button>

          <p className="mt-4 text-center text-sm text-subtle">
            Already have an account?{" "}
            <Link className="underline" href="/admin">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
