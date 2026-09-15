import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { readExportParams } from "@/lib/exports/params";
import { peopleLoader } from "@/lib/exports/people";
import { findExportReport } from "@/lib/exports/reports";
import { notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";

const headers = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};

/** The page asks again whenever a date or term changes, so this allows far more than a download. */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireApprover(req);
  if (!user) return notAuthorized();

  const limited = rateLimit(
    req,
    "exports-preview",
    600,
    60 * 60 * 1000,
    user.sub,
  );
  if (limited) return limited;

  const { id } = await params;
  const report = findExportReport(id);
  if (!report) return notFound();

  const now = new Date();
  const read = readExportParams(report, req.nextUrl.searchParams, now);
  if ("error" in read) {
    return NextResponse.json({ error: read.error }, { status: 400, headers });
  }

  try {
    const built = await report.build({
      now,
      params: read.values,
      people: peopleLoader(),
    });
    return NextResponse.json({ preview: built.preview }, { headers });
  } catch (err) {
    console.error(`exports: preview for ${report.id} failed`, err);
    return NextResponse.json(
      { error: "Could not load a preview right now." },
      { status: 500, headers },
    );
  }
};
