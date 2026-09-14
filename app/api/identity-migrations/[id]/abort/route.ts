import { NextResponse, type NextRequest } from "next/server";
import { findMigration } from "@/lib/db/identity-migrations";
import { abortMigration } from "@/lib/identity/migration";
import { migrationView } from "@/lib/identity/view";
import { notAuthorized, notFound } from "@/lib/json";
import { migrationViewer } from "../../access";

/** The member may abort their own change before cut-over; an approver, anyone's. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const record = await findMigration(id);
  if (!record) return notFound();
  if (!(await migrationViewer(req, record))) return notAuthorized();
  const result = await abortMigration(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  const after = await findMigration(id);
  if (!after) return notFound();
  return NextResponse.json(migrationView(after));
};
