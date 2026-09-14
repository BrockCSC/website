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

// A table can exist on this branch (and so in this schema, freshly migrated)
// before prod has ever run that migration — every branch that adds a table
// hits this until it merges and a prod release actually creates it there.
const prodTables = await pool.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'prod'`,
);
const prodTableNames = new Set(prodTables.rows.map((row) => row.table_name));

for (const table of [
  "events",
  "execs",
  "signups",
  "shared_mailboxes",
  "retired_mailboxes",
  "documents",
  "document_versions",
]) {
  if (!prodTableNames.has(table)) {
    console.log(`prod has no "${table}" table yet; skipping.`);
    continue;
  }
  await pool.query(`TRUNCATE TABLE "${schema}"."${table}"`);
  await pool.query(
    `INSERT INTO "${schema}"."${table}" SELECT * FROM "prod"."${table}"`,
  );
}

// signing_requests and pending_document_actions carry external signers' PII
// (name, email, IP, user-agent, typed signature text) and, for anything not
// yet signed or reviewed, a still-live tokenHash — the same class of secret
// password_resets is already excluded from this loop for. Truncated, not
// copied: previews still get a clean slate, never prod's live data.
for (const table of ["signing_requests", "pending_document_actions"]) {
  await pool.query(`TRUNCATE TABLE "${schema}"."${table}"`);
}

await pool.end();

console.log(`Synced schema "${schema}" from prod.`);
