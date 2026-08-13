/**
 * Copies every remote image into the uploads volume and rewrites the record
 * to a local /uploads/... path. Runs inside the app container.
 *
 *   DRY=1 node migrate-images.mjs     report only
 *         node migrate-images.mjs     apply
 *
 * Idempotent: records already pointing at /uploads are skipped.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const DRY = process.env.DRY === "1";
const SCHEMA = process.env.DB_SCHEMA ?? "prod";
const ROOT = process.env.UPLOAD_DIR ?? "/data/uploads";

const EXT = {
  "image/jpeg": ".jpg",
  // Legacy type IIS/older tooling used for .jfif; it is a normal JPEG.
  "image/pjpeg": ".jpg",
  // One event poster is genuinely a PDF. Preserve it rather than orphan it;
  // the upload endpoint still refuses PDFs for anything new.
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const rows = [];
for (const table of ["execs", "events"]) {
  const res = await pool.query(
    `SELECT id, data->>'name' AS name, data->>'title' AS title, data#>>'{image,url}' AS url
     FROM "${SCHEMA}"."${table}" WHERE data#>>'{image,url}' IS NOT NULL`,
  );
  res.rows.forEach((r) => rows.push({ ...r, table }));
}

const remote = rows.filter((r) => /^https?:\/\//.test(r.url));
const local = rows.length - remote.length;
console.log(
  `${rows.length} records with an image | ${remote.length} remote | ${local} already local`,
);
if (DRY) {
  const hosts = {};
  remote.forEach((r) => {
    const h = new URL(r.url).host;
    hosts[h] = (hosts[h] ?? 0) + 1;
  });
  console.log("hosts:", JSON.stringify(hosts));
  await pool.end();
  process.exit(0);
}

const mapping = [];
let ok = 0;
let failed = 0;

for (const row of remote) {
  try {
    const res = await fetch(row.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EXT[type];
    if (!ext) throw new Error(`unsupported content-type ${type || "(none)"}`);

    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) throw new Error("empty body");

    const name = `migrated/${randomUUID()}${ext}`;
    const target = join(ROOT, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);

    const newUrl = `/uploads/${name}`;
    await pool.query(
      `UPDATE "${SCHEMA}"."${row.table}"
       SET data = jsonb_set(data, '{image,url}', to_jsonb($1::text))
       WHERE id = $2`,
      [newUrl, row.id],
    );

    mapping.push({ table: row.table, id: row.id, from: row.url, to: newUrl });
    ok++;
  } catch (err) {
    failed++;
    console.log(`FAILED ${row.table} ${row.name ?? row.id}: ${err.message}`);
    console.log(`       ${row.url}`);
  }
}

await writeFile(
  join(ROOT, "migration-rollback.json"),
  JSON.stringify(mapping, null, 2),
);

console.log(`\nmigrated ${ok}, failed ${failed}`);
console.log(`rollback map: ${ROOT}/migration-rollback.json`);
await pool.end();
