/** Shared by the runner (order) and the browser (labels), so it stays dependency-free. */

type StepPhase = "A" | "B" | "C";

export type StepMeta = { id: string; label: string; phase: StepPhase };

export const STEP_LIST: StepMeta[] = [
  { id: "keycloak:create", label: "Create the new login", phase: "A" },
  { id: "keycloak:roles", label: "Copy roles onto it", phase: "A" },
  { id: "mailbox:create", label: "Create the new mailbox", phase: "A" },
  { id: "mailbox:folders", label: "Recreate folders", phase: "A" },
  { id: "mailbox:copy", label: "Copy messages", phase: "A" },
  { id: "mailbox:sieve", label: "Copy mail rules", phase: "A" },
  { id: "verify:pre", label: "Check the copy", phase: "A" },
  { id: "keycloak:freeze-old", label: "Disable the old login", phase: "B" },
  { id: "mailbox:freeze-old", label: "Freeze the old mailbox", phase: "B" },
  { id: "mailbox:delta", label: "Copy what arrived meanwhile", phase: "B" },
  { id: "db:repoint", label: "Move the account record", phase: "B" },
  { id: "keycloak:enable-new", label: "Enable the new login", phase: "B" },
  { id: "mail:routing", label: "Rewire mail routing", phase: "B" },
  { id: "session:handoff", label: "Hand over the session", phase: "B" },
  { id: "notify:cutover", label: "Send the cut-over notice", phase: "B" },
  { id: "verify:final", label: "Verify everything", phase: "C" },
  { id: "retire:old-mailbox", label: "Retire the old mailbox", phase: "C" },
  { id: "retire:old-keycloak", label: "Delete the old login", phase: "C" },
  { id: "exec:name", label: "Update the team page name", phase: "C" },
  { id: "notify:done", label: "Send the completion notice", phase: "C" },
];

/** Before this step nothing has been taken away; after it the machine is forward-only. */
export const FIRST_CUTOVER_STEP = "keycloak:freeze-old";

/** How long the old address keeps delivering to the successor. */
export const FORWARD_DAYS = 90;
