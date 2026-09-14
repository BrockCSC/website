import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { clubDay } from "@/lib/exports/dates";
import { readExportParams } from "@/lib/exports/params";
import { renderReportPdf } from "@/lib/exports/pdf";
import { peopleLoader } from "@/lib/exports/people";
import { findExportReport } from "@/lib/exports/reports";
import { notAuthorized, notFound } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { bytesToBody } from "@/lib/response-body";

const headers = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};

/**
 * A club record on letterhead, built from the database on every request and
 * never stored. Co-presidents only (requireApprover): the confidential
 * exports carry student numbers and access card IDs.
 */
export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireApprover(req);
  if (!user) return notAuthorized();

  const limited = rateLimit(
    req,
    "exports-download",
    60,
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

  let bytes: Uint8Array;
  try {
    const built = await report.build({
      now,
      params: read.values,
      people: peopleLoader(),
    });
    bytes = await renderReportPdf(built.render(), {
      generatedAt: now,
      generatedBy: user.name || user.email,
      confidential: report.confidential,
    });
  } catch (err) {
    console.error(`exports: building ${report.id} failed`, err);
    return NextResponse.json(
      { error: "Could not build that export right now." },
      { status: 500, headers },
    );
  }

  // Who pulled which record, never the params (free text) or anything in it.
  console.info(`exports: ${user.email} downloaded ${report.id}`);
  return new NextResponse(bytesToBody(bytes), {
    headers: {
      ...headers,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="BrockCSC - ${report.title} - ${clubDay(now)}.pdf"`,
    },
  });
};
