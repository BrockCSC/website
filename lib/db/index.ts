import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let instance: NodePgDatabase | undefined;

const getDb = (): NodePgDatabase => {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL env var is not set.");
  }

  const schema = process.env.DB_SCHEMA ?? "public";
  if (!/^[a-z0-9_]+$/.test(schema)) {
    throw new Error(`Invalid DB_SCHEMA: ${schema}`);
  }

  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  instance = drizzle(pool);
  return instance;
};

export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get: (_target, prop) => Reflect.get(getDb(), prop),
});
