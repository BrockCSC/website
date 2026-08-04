import { appendFileSync } from "node:fs";

const VPS_HOST = "129-153-49-190.sslip.io";

const slugify = (branch) =>
  branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const schemaSlug = (slug) => slug.replace(/-/g, "_");

const ref = process.env.REF;

let projectName;
let subdomain;
let dbSchema;
let branch;

if (ref.startsWith("refs/tags/")) {
  branch = ref.slice("refs/tags/".length);
  projectName = "brockcsc-prod";
  subdomain = `brockcsc.${VPS_HOST}`;
  dbSchema = "prod";
} else if (ref === "refs/heads/main") {
  branch = "main";
  projectName = "brockcsc-uat";
  subdomain = `uat.${VPS_HOST}`;
  dbSchema = "uat";
} else {
  branch = ref.replace(/^refs\/heads\//, "");
  const slug = slugify(branch);
  projectName = `brockcsc-pr-${slug}`;
  subdomain = `${slug}.${VPS_HOST}`;
  dbSchema = `preview_${schemaSlug(slug)}`;
}

const databaseUrl = `postgresql://brockcsc:[[BROCKCSC_DB_PASSWORD]]@postgres:5432/brockcsc`;
const environment = [
  `PROJECT_NAME=${projectName}`,
  `SUBDOMAIN=${subdomain}`,
  `DATABASE_URL=${databaseUrl}`,
  `DB_SCHEMA=${dbSchema}`,
  `KEYCLOAK_ISSUER=[[BROCKCSC_KEYCLOAK_ISSUER]]`,
  `KEYCLOAK_CLIENT_ID=[[BROCKCSC_KEYCLOAK_CLIENT_ID]]`,
  `KEYCLOAK_CLIENT_SECRET=[[BROCKCSC_KEYCLOAK_CLIENT_SECRET]]`,
  `ADMIN_ROLE=brockcsc-admin`,
  `SESSION_JWT_SECRET=[[BROCKCSC_SESSION_JWT_SECRET]]`,
].join("\n");

console.log(`Deploying ${projectName} from ${branch} -> https://${subdomain}`);

const output = process.env.GITHUB_OUTPUT;
appendFileSync(output, `branch=${branch}\n`);
appendFileSync(output, `stack-name=${projectName}\n`);
appendFileSync(output, `subdomain=${subdomain}\n`);
appendFileSync(output, `environment<<EOF\n${environment}\nEOF\n`);
