import { Pool } from "pg";
import { dottedAliasFor } from "../lib/auth/username.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL env var is not set.");
  process.exit(1);
}

const schema = process.env.DB_SCHEMA ?? "public";
if (!/^[a-z0-9_]+$/.test(schema)) {
  throw new Error(`Invalid DB_SCHEMA: ${schema}`);
}

const domain = process.env.MAIL_DOMAIN ?? "brockcsc.ca";

const pool = new Pool({ connectionString });

/** Approved sign-ups whose exec record is still current. Alumni keep their
 * login but get no mailbox, and an exec who never signed up has no account to
 * attach one to. */
const { rows } = await pool.query<{
  username: string;
  first: string;
  last: string;
  title: string;
}>(
  `SELECT s.data->>'username' AS username,
          s.data->>'firstName' AS first,
          s.data->>'lastName'  AS last,
          e.data->>'title'     AS title
     FROM "${schema}".signups s
     JOIN "${schema}".execs e ON e.id::text = s.data->>'execKey'
    WHERE s.data->>'status' = 'approved'
      AND e.data->>'isCurrentExec' = 'true'
    ORDER BY username`,
);
await pool.end();

const plan = rows.map(({ username, first, last, title }) => {
  const alias = dottedAliasFor(first, last);
  return {
    username,
    title,
    primary: `${username}@${domain}`,
    alias: alias && alias !== username ? `${alias}@${domain}` : null,
  };
});

const clash = plan
  .map((p) => p.primary)
  .filter((addr, i, all) => all.indexOf(addr) !== i);
if (clash.length) {
  console.error(
    `Refusing to continue, duplicate addresses: ${clash.join(", ")}`,
  );
  process.exit(1);
}

console.log(JSON.stringify({ domain, count: plan.length, plan }, null, 2));
