import { singleLine } from "@/lib/documents/signature-marks";
import { isValidTerm } from "@/lib/execs/terms";
import { dateBounds, isCalendarDay, longDate } from "./dates";
import type { ExportMeta, ExportParamValues } from "./types";

/** The report's declared params from the query string, falling back to its defaults for any not sent. */
export const readExportParams = (
  report: ExportMeta,
  search: URLSearchParams,
  now: Date,
): { values: ExportParamValues } | { error: string } => {
  const defaults = report.defaults?.(now) ?? {};
  const bounds = dateBounds(now);
  const values: ExportParamValues = {};

  for (const param of report.params) {
    // The card sends every param, so a cleared required date fails here instead of quietly using its default.
    const value = (
      search.has(param.name)
        ? (search.get(param.name) ?? "")
        : (defaults[param.name] ?? "")
    ).trim();

    if (param.kind === "date") {
      if (!value) {
        if (!param.optional) return { error: `${param.label} is required.` };
      } else if (!isCalendarDay(value)) {
        return { error: `${param.label} must be a valid date.` };
      } else if (value < bounds.min || value > bounds.max) {
        return {
          error: `${param.label} must be between ${longDate(bounds.min)} and ${longDate(bounds.max)}.`,
        };
      }
      values[param.name] = value;
    } else if (param.kind === "text") {
      const text = singleLine(value);
      if (param.maxLength && text.length > param.maxLength) {
        return {
          error: `${param.label} must be ${param.maxLength} characters or fewer.`,
        };
      }
      values[param.name] = text;
    } else {
      if (!isValidTerm(value, now)) {
        return {
          error: `${param.label} must be an academic year like 2025-2026.`,
        };
      }
      values[param.name] = value;
    }
  }

  const invalid = report.validate?.(values, now);
  return invalid ? { error: invalid } : { values };
};

/** Shared validate for from/to reports. */
export const dateRangeError = (values: ExportParamValues): string | null =>
  values.from && values.to && values.from > values.to
    ? "The start date must be on or before the end date."
    : null;
