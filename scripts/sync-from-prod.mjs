import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL env var is not set.");
}

const schema = process.env.DB_SCHEMA ?? "public";
if (!/^[a-z0-9_]+$/.test(schema)) {
  throw new Error(`Invalid DB_SCHEMA: ${schema}`);
}

if (schema === "prod") {
  console.log("DB_SCHEMA is prod; skipping sync-from-prod.");
  process.exit(0);
}

const pool = new Pool({ connectionString });

const prodSchemaExists = await pool.query(
  `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prod'`,
);
if (prodSchemaExists.rowCount === 0) {
  console.log("prod schema does not exist yet; skipping sync-from-prod.");
  await pool.end();
  process.exit(0);
}

for (const table of ["events", "execs"]) {
  await pool.query(`TRUNCATE TABLE "${schema}"."${table}"`);
  await pool.query(
    `INSERT INTO "${schema}"."${table}" SELECT * FROM "prod"."${table}"`,
  );
}

await pool.end();

console.log(`Synced schema "${schema}" from prod.`);
