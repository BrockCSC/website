import type { SignupRecord } from "@/lib/api/types";
import { cleanAccessCardId } from "./access-card";
import { EMAIL_PATTERN, STUDENT_ID_PATTERN } from "./validation";

const isText = (value: unknown) =>
  value === undefined || typeof value === "string";

export type SignupDetailsInput = Pick<
  SignupRecord,
  "firstName" | "lastName" | "email" | "phone" | "studentId" | "accessCardId"
>;

export const MAX_NAME = 60;

/**
 * The subset a member may edit about themselves. Phone stays the approver's.
 * Picks fields off the body by name: spreading it would hand a member
 * status, mailDailyLimit or keycloakUserId.
 */
export const cleanMemberDetails = (
  body: Record<string, unknown>,
): { error: string } | { patch: Partial<SignupRecord> } => {
  const picked: SignupDetailsInput = {};
  for (const key of [
    "firstName",
    "lastName",
    "email",
    "studentId",
    "accessCardId",
  ] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") return { error: "Expected text." };
    picked[key] = body[key];
  }
  if (
    (picked.firstName?.length ?? 0) > MAX_NAME ||
    (picked.lastName?.length ?? 0) > MAX_NAME
  ) {
    return { error: "That name is too long." };
  }
  return cleanSignupDetails(picked);
};

/**
 * Fields an approver may edit about a person's roster record. Deliberately
 * excludes username, status, keycloakUserId, mailDailyLimit and everything
 * else on SignupRecord — those already have their own narrower routes, and
 * username in particular is load-bearing for mailbox provisioning.
 */
export const cleanSignupDetails = (
  body: SignupDetailsInput,
): { error: string } | { patch: Partial<SignupRecord> } => {
  if (
    !isText(body.firstName) ||
    !isText(body.lastName) ||
    !isText(body.email) ||
    !isText(body.phone) ||
    !isText(body.studentId)
  ) {
    return { error: "Expected text." };
  }
  // Omitting a field leaves it alone, but these three can't be blanked: name
  // and email are pushed to Keycloak, and sign-up requires all of them.
  if (
    [body.firstName, body.lastName, body.email].some(
      (value) => value !== undefined && !value.trim(),
    )
  ) {
    return { error: "First name, last name and email can't be empty." };
  }
  const email = body.email?.trim() ?? "";
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: "That doesn't look like a valid email." };
  }
  const studentId = body.studentId?.trim() ?? "";
  if (studentId && !STUDENT_ID_PATTERN.test(studentId)) {
    return { error: "That student number does not look right." };
  }

  const card = cleanAccessCardId(body.accessCardId);
  if ("error" in card) return card;

  return {
    patch: {
      firstName: body.firstName?.trim(),
      lastName: body.lastName?.trim(),
      email: body.email?.trim(),
      phone: body.phone?.trim(),
      studentId: body.studentId?.trim(),
      accessCardId: body.accessCardId === undefined ? undefined : card.value,
    },
  };
};
