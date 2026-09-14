import { NextResponse, type NextRequest } from "next/server";
import { requireApprover } from "@/lib/auth/session";
import { findMigration } from "@/lib/db/identity-migrations";
import { resumeMigration } from "@/lib/identity/migration";
import { migrationView } from "@/lib/identity/view";
import { notAuthorized, notFound } from "@/lib/json";

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  if (!(await requireApprover(req))) return notAuthorized();
  const { id } = await params;
  const result = await resumeMigration(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  const record = await findMigration(id);
  if (!record) return notFound();
  return NextResponse.json(migrationView(record));
};
