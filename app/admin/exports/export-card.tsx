"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { academicTerms } from "@/lib/execs/terms";
import { dateBounds } from "@/lib/exports/dates";
import type {
  ExportParam,
  ExportParamValues,
  ExportPreview,
  ExportSummary,
} from "@/lib/exports/types";
import { Label, Note, Pill, field } from "../users/ui";
import { downloadExport, errorText, fetchExportPreview } from "./api";

export default function ExportCard({ report }: { report: ExportSummary }) {
  const [values, setValues] = useState<ExportParamValues>(report.defaults);
  const [preview, setPreview] = useState<ExportPreview | null>(report.preview);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
    // Text params never change a preview, so typing doesn't refetch.
    if (param.kind === "text") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(next), 400);
  };

  const download = async () => {
    setError(null);
    setDownloading(true);
    try {
      await downloadExport(report.id, values);
    } catch (err) {
      setError(errorText(err, "Could not build that PDF."));
    } finally {
      setDownloading(false);
    }
  };

  const attention = preview?.attention;
  const bounds = dateBounds(new Date());

  return (
    <section className="flex animate-fade-in flex-col rounded-[20px] border-2 border-line bg-surface p-5 shadow-brut transition-shadow duration-[var(--dur)] ease-smooth hover:shadow-[6px_6px_0_0_var(--brand)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink">{report.title}</h2>
        {report.confidential && <Pill tone="accent">Confidential</Pill>}
      </div>
      <p className="mt-1 text-sm text-subtle">{report.description}</p>

      {report.params.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {report.params.map((param) => {
            const inputId = `${report.id}-${param.name}`;
            const value = values[param.name] ?? "";
            return (
              <div key={param.name}>
                <Label htmlFor={inputId}>{param.label}</Label>
                {param.kind === "term" ? (
                  <select
                    className={field}
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
                    className={field}
                    id={inputId}
                    max={param.kind === "date" ? bounds.max : undefined}
                    maxLength={param.maxLength}
                    min={param.kind === "date" ? bounds.min : undefined}
                    onChange={(e) => change(param, e.target.value)}
                    placeholder={param.placeholder}
                    required={param.kind === "date" && !param.optional}
                    type={param.kind}
                    value={value}
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
        <details className="mt-3 rounded-[10px] border-2 border-line bg-tint px-3 py-2 text-sm">
          <summary className="cursor-pointer font-bold text-ink">
            {attention.label}
          </summary>
          <ul className="mt-2 space-y-1">
            {attention.people.map((person, i) => (
              <li key={`${i}-${person.name}`}>
                <span className="font-semibold text-ink">{person.name}</span>{" "}
                <span className="text-subtle">— {person.detail}</span>
              </li>
            ))}
          </ul>
          <Link
            className="mt-2 inline-block font-bold text-brand underline underline-offset-4"
            href="/admin/users"
          >
            Fix in Users
          </Link>
        </details>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button
          disabled={downloading}
          onClick={download}
          size="sm"
          variant="primary"
        >
          <Download aria-hidden />
          {downloading ? "Building…" : "Download PDF"}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Note>{error}</Note>
        </div>
      )}
    </section>
  );
}
