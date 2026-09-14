import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { readExportParams } from "@/lib/exports/params";
import { peopleLoader } from "@/lib/exports/people";
import { EXPORT_REPORTS } from "@/lib/exports/reports";
import type { ExportListing, ExportSummary } from "@/lib/exports/types";
import { notAuthorized } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

const headers = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};

/** Every export with its default params and a preview built from them. Co-presidents only: previews name people. */
export const GET = async (req: NextRequest) => {
  const user = await requireApprover(req);
  if (!user) return notAuthorized();

  const limited = rateLimit(req, "exports-list", 120, 60 * 60 * 1000, user.sub);
  if (limited) return limited;

  const now = new Date();
  const people = peopleLoader();
  const reports = await Promise.all(
    EXPORT_REPORTS.map(async (report): Promise<ExportSummary> => {
      const summary = {
        id: report.id,
        title: report.title,
        description: report.description,
        confidential: report.confidential,
        params: report.params,
      };
      const read = readExportParams(report, new URLSearchParams(), now);
      if ("error" in read) {
        console.error(
          `exports: defaults for ${report.id} are invalid`,
          read.error,
        );
        return { ...summary, defaults: {}, preview: null };
      }
      try {
        const built = await report.build({ now, params: read.values, people });
        return { ...summary, defaults: read.values, preview: built.preview };
      } catch (err) {
        console.error(`exports: preview for ${report.id} failed`, err);
        return { ...summary, defaults: read.values, preview: null };
      }
    }),
  );

  return NextResponse.json({ reports } satisfies ExportListing, { headers });
};
