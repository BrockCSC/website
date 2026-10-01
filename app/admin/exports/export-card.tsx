"use client";

import { ChevronRight, Download, Share } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/announce";
import { academicTerms } from "@/lib/execs/terms";
import { dateBounds } from "@/lib/exports/dates";
import type {
  ExportParam,
  ExportParamValues,
  ExportPreview,
  ExportSummary,
} from "@/lib/exports/types";
import { COARSE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { Label, Note, Pill, field } from "../users/ui";
import {
  type BuiltExport,
  buildExport,
  errorText,
  fetchExportPreview,
  saveExport,
  shareableFile,
} from "./api";

/**
 * The card's primary button: full width and 44px on phones (dash-8), 44px
 * on any touch screen, and the old sm Button on a desktop pointer.
 */
const wideButton =
  "h-11 w-full text-base sm:w-auto sm:pointer-fine:h-9 sm:pointer-fine:text-sm";

/** A PDF built on a phone that can share files, waiting for a fresh tap to share it. */
type Ready = BuiltExport & { file: File };

export default function ExportCard({ report }: { report: ExportSummary }) {
  const [values, setValues] = useState<ExportParamValues>(report.defaults);
  const [preview, setPreview] = useState<ExportPreview | null>(report.preview);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const refresh = async (next: ExportParamValues) => {
    const id = ++requestId.current;
    setPreviewing(true);
    try {
      const result = await fetchExportPreview(report.id, next);
      if (id === requestId.current) setPreview(result.preview);
    } catch (err) {
      if (id === requestId.current) {
        setPreview({
          summary: errorText(err, "Couldn't refresh the preview."),
        });
      }
    } finally {
      if (id === requestId.current) setPreviewing(false);
    }
  };

  const change = (param: ExportParam, value: string) => {
    const next = { ...values, [param.name]: value };
    setValues(next);
    // A built PDF no longer matches the form.
    setReady(null);
    // Text params never change a preview, so typing doesn't refetch.
    if (param.kind === "text") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(next), 400);
  };

  const download = async () => {
    setError(null);
    setDownloading(true);
    try {
      const built = await buildExport(report.id, values);
      // navigator.share needs a fresh tap, and the build ate this one's
      // activation. So on touch the button turns into "Share PDF" (dash-12).
      const file = mediaMatches(COARSE_QUERY) ? shareableFile(built) : null;
      if (file) {
        setReady({ ...built, file });
        announce(`${built.filename} is ready to share.`);
      } else saveExport(built);
    } catch (err) {
      setError(errorText(err, "Could not build that PDF."));
    } finally {
      setDownloading(false);
    }
  };

  const share = async (current: Ready) => {
    setError(null);
    try {
      await navigator.share({ files: [current.file], title: report.title });
    } catch (err) {
      // Closing the share sheet is not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Couldn't open the share sheet. Download it instead.");
    }
  };

  const attention = preview?.attention;
  const bounds = dateBounds(new Date());
  const dates = report.params.filter((param) => param.kind === "date");
  // From/To side by side from 380px, and each bounds the other (dash-9).
  const range =
    report.params.length === 2 &&
    dates.length === 2 &&
    dates.some((param) => param.name === "from") &&
    dates.some((param) => param.name === "to");

  const dateLimits = (param: ExportParam) => {
    if (param.kind !== "date") return { min: undefined, max: undefined };
    if (range && param.name === "from")
      return { min: bounds.min, max: values.to || bounds.max };
    if (range && param.name === "to")
      return { min: values.from || bounds.min, max: bounds.max };
    return { min: bounds.min, max: bounds.max };
  };

  return (
    <section className="flex animate-fade-in flex-col rounded-[20px] border-2 border-line bg-surface p-4 shadow-brut transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[6px_6px_0_0_var(--brand)] max-md:shadow-none sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink">{report.title}</h2>
        {report.confidential && <Pill tone="accent">Confidential</Pill>}
      </div>
      <p className="mt-1 text-sm text-subtle">{report.description}</p>

      {report.params.length > 0 && (
        <div
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${range ? "min-[380px]:grid-cols-2" : ""}`}
        >
          {report.params.map((param) => {
            const inputId = `${report.id}-${param.name}`;
            const value = values[param.name] ?? "";
            const { min, max } = dateLimits(param);
            return (
              <div key={param.name} className="min-w-0">
                <Label htmlFor={inputId}>{param.label}</Label>
                {param.kind === "term" ? (
                  <select
                    className={`${field} pointer-coarse:min-h-11`}
                    id={inputId}
                    onChange={(e) => change(param, e.target.value)}
                    value={value}
                  >
                    <option value="">{param.placeholder}</option>
                    {academicTerms().map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={
                      param.kind === "date"
                        ? `${field} pointer-coarse:min-h-11`
                        : field
                    }
                    id={inputId}
                    max={max}
                    maxLength={param.maxLength}
                    min={min}
                    onChange={(e) => change(param, e.target.value)}
                    placeholder={param.placeholder}
                    required={param.kind === "date" && !param.optional}
                    type={param.kind}
                    value={value}
                    {...(param.kind === "text"
                      ? {
                          enterKeyHint: "done" as const,
                          autoComplete: "off",
                          autoCorrect: "off",
                          spellCheck: false,
                        }
                      : {})}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p aria-live="polite" className="mt-4 text-sm font-semibold text-ink">
        {preview?.summary ?? "Preview unavailable."}
        {previewing && <span className="ml-2 text-subtle">Updating…</span>}
      </p>
      {preview?.warnings?.map((warning, i) => (
        <p className="mt-1 text-sm text-subtle" key={`${i}-${warning}`}>
          {warning}
        </p>
      ))}
      {attention && attention.people.length > 0 && (
        <details className="group mt-3 rounded-[10px] border-2 border-line bg-tint text-sm">
          <summary className="cursor-pointer px-3 py-2 font-bold text-ink pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:list-none pointer-coarse:items-center pointer-coarse:gap-2 pointer-coarse:[&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="hidden size-4 shrink-0 transition-transform duration-[var(--dur-fast)] ease-smooth group-open:rotate-90 pointer-coarse:block"
            />
            {attention.label}
          </summary>
          <div className="px-3 pb-2">
            <ul className="space-y-1">
              {attention.people.map((person, i) => (
                <li key={`${i}-${person.name}`}>
                  <span className="font-semibold text-ink">{person.name}</span>{" "}
                  <span className="text-subtle">— {person.detail}</span>
                </li>
              ))}
            </ul>
            <Link
              className="mt-2 inline-block font-bold text-brand underline underline-offset-4 pointer-coarse:mt-0 pointer-coarse:py-3"
              href="/admin/users"
            >
              Fix in Users
            </Link>
          </div>
        </details>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {ready ? (
          <>
            <p className="w-full min-w-0 text-sm text-subtle wrap-anywhere">
              Ready:{" "}
              <span className="font-semibold text-ink">{ready.filename}</span>
            </p>
            <Button
              className={wideButton}
              onClick={() => void share(ready)}
              size="sm"
              variant="primary"
            >
              <Share aria-hidden />
              Share PDF
            </Button>
            <button
              className="press-flat min-h-11 w-full rounded-[10px] px-3 text-base font-semibold text-ink underline underline-offset-4 sm:w-auto sm:text-sm"
              onClick={() => saveExport(ready)}
              type="button"
            >
              Download instead
            </button>
          </>
        ) : (
          <Button
            // Cards stack on phones; keep brand red off so no screen shows
            // several equal-weight primaries (D21). Desktop keeps primary.
            className={`${wideButton} phone:bg-raised phone:text-ink`}
            disabled={downloading}
            onClick={download}
            size="sm"
            variant="primary"
          >
            <Download aria-hidden />
            {downloading ? "Building…" : "Download PDF"}
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Note>{error}</Note>
        </div>
      )}
    </section>
  );
}
