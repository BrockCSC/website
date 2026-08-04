import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "./index";
import type { eventsTable, execsTable } from "./schema";

type JsonbTable = typeof eventsTable | typeof execsTable;
type Entity<T> = T & { id: string };

const toEntity = <T>(row: { id: string; data: unknown }): Entity<T> => ({
  id: row.id,
  ...(row.data as T),
});

const toWireRecord = <T>(entity: Entity<T>) => {
  const { id, ...rest } = entity;
  return { $key: id, ...rest };
};

export const findAll = async <T>(table: JsonbTable): Promise<Entity<T>[]> => {
  const rows = await db.select().from(table).orderBy(table.createdAt);
  return rows.map((row) => toEntity<T>(row));
};

export const findById = async <T>(
  table: JsonbTable,
  id: string,
): Promise<Entity<T> | null> => {
  const rows = await db.select().from(table).where(eq(table.id, id));
  return rows[0] ? toEntity<T>(rows[0]) : null;
};

export const create = async <T>(
  table: JsonbTable,
  input: T,
): Promise<Entity<T>> => {
  const rows = await db.insert(table).values({ data: input }).returning();
  return toEntity<T>(rows[0]);
};

export const update = async <T>(
  table: JsonbTable,
  id: string,
  patch: Partial<T>,
): Promise<Entity<T> | null> => {
  const rows = await db
    .update(table)
    .set({ data: sql`${table.data} || ${patch}::jsonb` })
    .where(eq(table.id, id))
    .returning();
  return rows[0] ? toEntity<T>(rows[0]) : null;
};

export const remove = async (
  table: JsonbTable,
  id: string,
): Promise<boolean> => {
  const rows = await db
    .delete(table)
    .where(eq(table.id, id))
    .returning({ id: table.id });
  return rows.length > 0;
};

export const createCollectionHandlers = <T>(table: JsonbTable) => ({
  GET: async () => {
    const entities = await findAll<T>(table);
    return NextResponse.json(entities.map(toWireRecord));
  },

  POST: async (req: NextRequest) => {
    const admin = await requireAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const input = (await req.json()) as T;
    const entity = await create<T>(table, input);
    return NextResponse.json(toWireRecord(entity), { status: 201 });
  },
});

export const createItemHandlers = <T>(table: JsonbTable) => ({
  GET: async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const entity = await findById<T>(table, id);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(toWireRecord(entity));
  },

  PATCH: async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const admin = await requireAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const { id } = await params;
    const patch = (await req.json()) as Partial<T>;
    const entity = await update<T>(table, id, patch);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(toWireRecord(entity));
  },

  DELETE: async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const admin = await requireAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const { id } = await params;
    const removed = await remove(table, id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  },
});
