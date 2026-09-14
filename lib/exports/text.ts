import type { ReportRun } from "./types";

export const plural = (count: number) => (count === 1 ? "" : "s");

/** A muted em dash for a detail that isn't on file. */
export const MISSING_VALUE: ReportRun[] = [{ text: "—", muted: true }];
