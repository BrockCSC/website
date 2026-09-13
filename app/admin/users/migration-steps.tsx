"use client";

import type {
  IdentityMigrationView,
  MigrationStepStatus,
  MigrationVerification,
} from "@/lib/api/types";

const STATUS_LABEL: Record<IdentityMigrationView["status"], string> = {
  planned: "Queued",
  running: "Running",
  "cut-over": "Cut over, verifying",
  failed: "Needs attention",
  done: "Done",
  aborted: "Aborted",
};

export const statusLabel = (migration: IdentityMigrationView) =>
  migration.mode === "rehearsal" ? "Rehearsed" : STATUS_LABEL[migration.status];

const GLYPH: Record<MigrationStepStatus, string> = {
  pending: "·",
  done: "✓",
  failed: "✕",
  skipped: "–",
  rehearsed: "~",
};

const PHASES: [IdentityMigrationView["steps"][number]["phase"], string][] = [
  ["A", "Build the new identity"],
  ["B", "Cut over"],
  ["C", "Verify, then retire the old one"],
];

function Verification({ report }: { report: MigrationVerification }) {
  return (
    <div className="rounded-[10px] border-2 border-line bg-raised px-3 py-2 text-sm">
      <div className="font-bold text-ink">
        {report.ok ? "Verification passed" : "Verification failed"}
        <span className="ml-2 font-normal text-subtle">
          {report.messagesChecked} messages checked
          {report.keywordMismatches ? `, ${report.keywordMismatches} flag` : ""}
          {report.receivedAtMismatches
            ? `, ${report.receivedAtMismatches} date`
            : ""}
          {report.otherMismatches ? `, ${report.otherMismatches} other` : ""}
          {report.keywordMismatches ||
          report.receivedAtMismatches ||
          report.otherMismatches
            ? " mismatches"
            : ""}
        </span>
      </div>
      <div className="mt-1 text-xs text-subtle">
        {[
          ["rules", report.sieveOk],
          ["roles", report.rolesOk],
          ["aliases", report.aliasesOk],
          ["sender", report.senderOk],
        ]
          .map(([label, ok]) => `${label} ${ok ? "ok" : "differ"}`)
          .join(" · ")}
      </div>
      {report.notes.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-ink">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MigrationSteps({
  migration,
}: {
  migration: IdentityMigrationView;
}) {
  const live =
    migration.status === "running" || migration.status === "cut-over";
  return (
    <div className="flex flex-col gap-3">
      {PHASES.map(([phase, label]) => (
        <div key={phase}>
          <div className="text-xs font-extrabold uppercase tracking-wide text-subtle">
            {label}
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {migration.steps
              .filter((step) => step.phase === phase)
              .map((step) => (
                <li
                  className={`flex items-start gap-2 text-sm ${
                    step.status === "failed"
                      ? "text-destructive"
                      : step.status === "pending"
                        ? "text-subtle"
                        : "text-ink"
                  }`}
                  key={step.id}
                >
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-center font-mono font-bold"
                  >
                    {GLYPH[step.status]}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={
                        live && step.id === migration.step ? "font-bold" : ""
                      }
                    >
                      {step.label}
                    </span>
                    {step.id === "mailbox:copy" &&
                      migration.messages.total > 0 && (
                        <span className="text-subtle">
                          {" "}
                          · {migration.messages.copied}/
                          {migration.messages.total} messages
                        </span>
                      )}
                    {step.error && (
                      <span className="block text-xs">{step.error}</span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {migration.verification && (
        <Verification report={migration.verification} />
      )}
    </div>
  );
}
