// Connects to Postgres directly over wayfarer-net rather than SSH, since
// Komodo Core has no docker.sock access to exec into the postgres container.

import { Client } from "npm:pg@8";

const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const REPO = "BrockCSC/website";

const slugify = (branch: string): string =>
  branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const schemaSlug = (slug: string): string => slug.replace(/-/g, "_");

const ghFetch = async (path: string) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status}`);
  }
  return res.json();
};

const branches = (await ghFetch("/branches?per_page=100")) as {
  name: string;
}[];
const slugToBranch = new Map<string, string>();
for (const branch of branches)
  slugToBranch.set(slugify(branch.name), branch.name);

const stacks = (await komodo.read("ListStacks", {})) as { name: string }[];
const now = Date.now();

const client = new Client({
  connectionString: `postgresql://brockcsc:[[BROCKCSC_DB_PASSWORD]]@postgres:5432/brockcsc`,
});
await client.connect();

try {
  for (const stack of stacks) {
    if (!stack.name.startsWith("brockcsc-pr-")) continue;

    const slug = stack.name.slice("brockcsc-pr-".length);
    const branch = slugToBranch.get(slug);

    let stale = false;
    if (!branch) {
      console.log(`${stack.name}: source branch no longer exists`);
      stale = true;
    } else {
      const commit = (await ghFetch(
        `/commits/${encodeURIComponent(branch)}`,
      )) as {
        commit: { committer?: { date: string }; author?: { date: string } };
      };
      const commitDate =
        commit.commit.committer?.date ?? commit.commit.author?.date;
      const ageMs = now - new Date(commitDate ?? 0).getTime();
      if (ageMs > STALE_MS) {
        console.log(
          `${stack.name}: branch '${branch}' last active ${Math.floor(ageMs / 86_400_000)} days ago, stale`,
        );
        stale = true;
      }
    }

    if (!stale) continue;

    await komodo.write("DeleteStack", { id: stack.name });

    const schema = `preview_${schemaSlug(slug)}`;
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    console.log(`Deleted ${stack.name} and dropped schema "${schema}"`);
  }
} finally {
  await client.end();
}
