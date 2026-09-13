import { NextResponse, type NextRequest } from "next/server";
import { findMigration } from "@/lib/db/identity-migrations";
import { resumeIfStale } from "@/lib/identity/migration";
import { migrationView } from "@/lib/identity/view";
import { notAuthorized, notFound } from "@/lib/json";
import { migrationViewer } from "../access";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const record = await findMigration(id);
  if (!record) return notFound();
  if (!(await migrationViewer(req, record))) return notAuthorized();
  resumeIfStale(record);
  return NextResponse.json(migrationView(record));
};
