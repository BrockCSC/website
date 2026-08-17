import type {
  ApplyResult,
  PersonDetail,
} from "@/app/api/signups/[id]/consequences";
import { apiFetch } from "@/lib/api/client";
import type { ExecRecord, SignupRecord, WithKey } from "@/lib/api/types";
import { sortExecsByRoleThenDatabaseOrder } from "@/lib/execs/order";

export type { ApplyResult, PersonDetail };
export type { Consequence } from "@/app/api/signups/[id]/consequences";

export type Exec = WithKey<ExecRecord>;
export type Signup = WithKey<SignupRecord> & {
  matchedExec?: {
    execKey: string;
    name: string;
    title?: string;
    claimed: boolean;
  } | null;
};

/** A tile and the account that claims it, whichever of the two exists. */
export type Person = {
  id: string;
  name: string;
  title?: string;
  username?: string;
  email?: string;
  status?: SignupRecord["status"];
  isCurrentExec?: boolean;
  execKey?: string;
  signupKey?: string;
  exec?: Exec;
  signup?: Signup;
};

export const fetchExecs = () => apiFetch<Exec[]>("/api/execs");
export const fetchPeopleSignups = () => apiFetch<Signup[]>("/api/signups");

export const fetchPerson = (id: string) =>
  apiFetch<PersonDetail>(`/api/signups/${id}`);

export const applyToPerson = (id: string, apply: string[]) =>
  apiFetch<ApplyResult>(`/api/signups/${id}/apply`, {
    method: "POST",
    body: JSON.stringify({ apply }),
  });

export const reviewMailLimit = (key: string, action: "approve" | "decline") =>
  apiFetch<void>(`/api/signups/${key}/mail-limit`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });

export const createTile = (exec: ExecRecord) =>
  apiFetch<Exec>("/api/execs", { method: "POST", body: JSON.stringify(exec) });

export const updateTile = (key: string, exec: Partial<ExecRecord>) =>
  apiFetch<Exec>(`/api/execs/${key}`, {
    method: "PATCH",
    body: JSON.stringify(exec),
  });

export const deleteTile = (key: string) =>
  apiFetch<void>(`/api/execs/${key}`, { method: "DELETE" });

export const deleteAccount = (key: string, withTile: boolean) =>
  apiFetch<void>(`/api/signups/${key}?deleteExec=${withTile}`, {
    method: "DELETE",
  });

const join = (exec: Exec | undefined, signup: Signup | undefined): Person => ({
  id: (signup?.$key ?? exec?.$key)!,
  name:
    exec?.name ||
    [signup?.firstName, signup?.lastName].filter(Boolean).join(" ") ||
    signup?.username ||
    "Unnamed",
  title: exec?.title,
  username: signup?.username,
  email: signup?.email,
  status: signup?.status,
  isCurrentExec: exec?.isCurrentExec,
  execKey: exec?.$key,
  signupKey: signup?.$key,
  exec,
  signup,
});

export const buildPeople = (execs: Exec[], signups: Signup[]): Person[] => {
  const claimed = new Map<string, Signup>();
  for (const signup of signups) {
    if (signup.execKey) claimed.set(signup.execKey, signup);
  }
  const current = sortExecsByRoleThenDatabaseOrder(
    execs.filter((exec) => exec.isCurrentExec !== false),
  );
  const past = execs.filter((exec) => exec.isCurrentExec === false);
  const keys = new Set(execs.map((exec) => exec.$key));
  const unlinked = signups.filter(
    (signup) => !signup.execKey || !keys.has(signup.execKey),
  );

  return [
    ...[...current, ...past].map((exec) => join(exec, claimed.get(exec.$key))),
    ...unlinked.map((signup) => join(undefined, signup)),
  ];
};

const haystack = (person: Person) =>
  [
    person.name,
    person.username,
    person.email,
    person.title,
    person.status ?? "no account",
    person.execKey ? (person.isCurrentExec === false ? "past" : "current") : "",
  ]
    .join(" ")
    .toLowerCase();

export const searchPeople = (people: Person[], query: string): Person[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return people;
  return people.filter((person) => {
    const text = haystack(person);
    return words.every((word) => text.includes(word));
  });
};
