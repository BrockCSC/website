# Contributing

Everything technical lives here. The [README](README.md) is deliberately user-facing only.

- [Prerequisites](#prerequisites)
- [Running locally](#running-locally)
- [Getting into the admin portal](#getting-into-the-admin-portal)
- [Architecture](#architecture)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [Mail](#mail)
- [Deploys](#deploys)
- [Adding an environment variable](#adding-an-environment-variable)
- [Conventions and checks](#conventions-and-checks)
- [Opening a pull request](#opening-a-pull-request)

## Prerequisites

- **Node 22.9+** — the dev scripts use `node --env-file-if-exists`
- **Docker** — for the local Postgres only
- A Keycloak account in the `brockcsc` realm, if you need the admin portal

## Running locally

```bash
git clone git@github.com:BrockCSC/website.git && cd website
npm ci
npm run db:up                       # local Postgres 16 on :5432
cp .env.local.example .env.local    # then fill in KEYCLOAK_CLIENT_SECRET
npm run dev                         # migrates first, then http://localhost:3000
```

Production Postgres lives on the VPS and is not reachable from your machine, so local dev runs its
own throwaway Postgres in Docker. Keycloak is public, so you log in against the real realm — there
is no local Keycloak.

| Script                            | What it does                                                   |
| --------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                     | `predev` runs `scripts/migrate.mjs`, then `next dev --webpack` |
| `npm run build`                   | `next build` (standalone output, see `Dockerfile`)             |
| `npm run start`                   | `next start`                                                   |
| `npm run lint`                    | `eslint`                                                       |
| `npm run typecheck`               | `next typegen && tsc --noEmit`                                 |
| `npm run format` / `format:check` | Prettier write / verify — CI runs the check                    |
| `npm run db:generate`             | `drizzle-kit generate` — writes a migration into `drizzle/`    |
| `npm run db:migrate`              | Applies migrations to `DB_SCHEMA`                              |
| `npm run db:up` / `db:down`       | Starts / stops `deploy/docker-compose.dev.yml`                 |

`scripts/migrate.mjs` exits with a message rather than starting against a broken database if
`DATABASE_URL` is missing, creates `DB_SCHEMA` if it does not exist, and rejects any schema name
that is not `^[a-z0-9_]+$`.

A fresh local schema is **empty** — no events, no execs. `scripts/sync-from-prod.mjs` only does
anything when a `prod` schema exists in the same database, which is never true locally, so populate
local data by hand through the admin portal.

Local dev writes to the `local` schema, entirely separate from `prod`, `uat` and previews.
`npm run db:down` stops the container; data lives in a named Docker volume and survives restarts.

> **Use Chrome or Firefox locally.** `sessionCookieOptions` sets `secure: true` unconditionally.
> Chrome and Firefox will set a `Secure` cookie on `http://localhost`; Safari will not, so the
> session never sticks.

## Getting into the admin portal

Auth is a direct password grant against the shared Keycloak `brockcsc` realm (`KEYCLOAK_ISSUER`).
You need two things, and they are separate asks:

1. **`KEYCLOAK_CLIENT_SECRET`** for the `brockcsc-web` client. Get it from a club admin or the
   Komodo stack config. It never goes in a committed file — `.env.local` is gitignored, keep it
   that way.
2. **A realm role on your user.** Without one, `POST /api/auth/login` returns 403 and you never get
   a session cookie at all — it is not a case of logging in and then being bounced. This catches
   people out.

| To test                                  | You need                                                          |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Own profile only                         | `alumni`                                                          |
| Portal, mail, analytics, events, profile | `executive`                                                       |
| Approving sign-ups, roles, mail limits   | `co-president` (composite, carries `brockcsc-approver`)           |
| Sign-up creating accounts                | `KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET` for `brockcsc-provisioner` |
| Everything, permanently                  | `owner` (see below)                                               |

The `owner` realm role (`SUPERUSER_ROLE`) satisfies every role check, including gates added after it
was introduced — the check lives in `requireRole` in `lib/auth/session.ts`, so new gates inherit it
for free. It is a realm role rather than a hardcoded username so it can be revoked from Keycloak
like any other. Grant it sparingly.

Roles are read from Keycloak **on each request** with a 15-second cache, not from the session
cookie, so grants and revokes take effect immediately. If Keycloak is unreachable, admin requests
are denied rather than falling back to stale roles. `GET /api/auth/roles-stream` is an SSE channel
(`lib/auth/role-events.ts`) that pushes a payload-free `roles` event so an open portal tab re-reads
`/api/auth/me` without a reload; a user who loses every role mid-session sees the portal swap to
"Your access has been removed."

The `brockcsc-provisioner` service account holds `manage-users` and `view-realm`. It deliberately
does **not** hold `manage-realm` — it runs at request time, so a leaked secret should not be able to
rewrite the realm's role model. Creating roles is a one-off admin task, done by hand.

Sign-up creates the Keycloak user **disabled**, so a test sign-up cannot log in until approved.
Rejecting deletes the user. Both are real writes against the shared realm — use obviously-fake names
when testing, and clean up after yourself.

Outside production, identity changes are **rehearsed rather than written**: `ownsIdentities()` in
`lib/env.ts` returns true only when `DB_SCHEMA === "prod"`, and the users screen shows a banner
saying so. The apply result reports `applied / rehearsed / skipped / failed`.

## Architecture

One Next.js 16 App Router application, no separate backend.

```
app/
  (public)/            route group: /, /events, /events/[eventId], /team, /cs-guide, /links
  signup/              public exec sign-up form
  admin/               the portal — page.tsx is the tile menu
    mail/ analytics/ events/ users/ profile/
    sections.ts        SECTIONS — the tile list, and the source of the header title
    palette.tsx        the ⌘K command palette
  api/                 route handlers (auth, events, execs, profile, signups, stats, mail/*, …)
  uploads/[...path]/   streams uploaded images off the uploads volume
components/            shared UI + sections used by the public pages
lib/
  auth/                session cookie, Keycloak password grant, admin client, invite codes
  db/                  drizzle pool, schema, generic repository helpers
  events/              recurrence, classification, .ics generation
  execs/               role ordering, social-link validation
  mail/                JMAP client, sanitising, signatures, provisioning, send limits
deploy/                docker-compose for prod (and dev Postgres, and the mail stack)
komodo/                deploy-context.mjs + the scheduled preview-sweep Komodo Action
drizzle/               generated migrations — commit them
```

**Host split.** `middleware.ts` gives the portal its own hostname. When `ADMIN_SUBDOMAIN` is set,
requests to that host rewrite `/` to `/admin`, and public paths 308-redirect to `PUBLIC_SUBDOMAIN`.
On the public host, `/admin*` 308-redirects to the admin host. With neither set (local dev) both
live on `localhost:3000`.

**Data model.** Four tables, all the same shape — `id uuid`, `data jsonb`, `created_at` — declared
by `jsonbTable()` in `lib/db/schema.ts`: `events`, `execs`, `signups`, `page_views`. CRUD routes are
generated by `createCollectionHandlers` / `createItemHandlers` in `lib/db/repository.ts`, so adding
a collection is a schema entry plus a route file, not a new query layer.

**Theming.** Light is the default. Dark is the `dark` class on `<html>` plus `localStorage`
`brockcsc-theme`; an inline script in `app/layout.tsx` applies it before paint to avoid a flash.
Tailwind v4 with `@custom-variant dark (&:is(.dark *))` in `app/globals.css`. Brand `#9a4440`,
dark-mode accent `#e08a82`. There is no system-preference option and no theme context — the toggle
in `components/theme-toggle.tsx` and the palette action both flip the class directly.

**Analytics data.** `components/page-view-tracker.tsx` POSTs the pathname to `/api/page-view` on
every public navigation. That route rate-limits to 60/min per IP, rejects non-public paths, `/admin`
and anything over 200 characters, and stores **only the path and a timestamp**. No cookies, no IP,
no user agent, no sessions — so the numbers are raw view counts, not unique visitors. Buckets are
computed in `America/Toronto`, not the server's timezone.

## Environment variables

Documented in `.env.example` (production shape) and `.env.local.example` (the local subset).

| Variable                               | Required    | Default                        | Notes                                                                                                        |
| -------------------------------------- | ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                         | yes         | —                              | Postgres connection string                                                                                   |
| `DB_SCHEMA`                            | no          | `public`                       | Schema-per-environment. Must match `^[a-z0-9_]+$`. `prod` is the only value that makes identity changes real |
| `KEYCLOAK_ISSUER`                      | yes         | —                              | Realm issuer URL                                                                                             |
| `KEYCLOAK_CLIENT_ID`                   | yes         | `brockcsc-web` in examples     | Login client                                                                                                 |
| `KEYCLOAK_CLIENT_SECRET`               | yes         | —                              | **Secret.** The one value you cannot make up locally                                                         |
| `ADMIN_ROLE`                           | no          | `executive`                    | Realm role required to reach the portal                                                                      |
| `ALUMNI_ROLE`                          | no          | `alumni`                       | Past execs: own profile only                                                                                 |
| `APPROVER_ROLE`                        | no          | `brockcsc-approver`            | Bundled into the `co-president` composite role                                                               |
| `SUPERUSER_ROLE`                       | no          | `owner`                        | Satisfies every role check                                                                                   |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET` | for sign-up | falls back to the login client | **Secret.** Service account with `manage-users` + `view-realm`                                               |
| `SESSION_JWT_SECRET`                   | yes         | —                              | **Secret.** Signs our own session cookie, not the Keycloak token                                             |
| `INVITE_CODE_SECRET`                   | yes         | —                              | **Secret.** Seeds the rotating sign-up invite code; changing it invalidates codes already handed out         |
| `MAIL_DOMAIN`                          | no          | `brockcsc.ca`                  | Mailbox domain                                                                                               |
| `STALWART_URL`                         | for mail    | —                              | The Stalwart container on the internal Docker network; its admin API is never exposed publicly               |
| `STALWART_ADMIN_USER` / `_SECRET`      | for mail    | —                              | **Secret.** Basic auth for the provisioning client only                                                      |
| `OCI_COMPARTMENT_OCID`                 | for mail    | —                              | **Secret.** OCI Email Delivery approved senders, reached with instance principal auth (no keys)              |
| `PROTECTED_MAIL_USERS`                 | no          | `alaqmargandhi`                | Comma-separated accounts that can never be deprovisioned or rate-limited                                     |
| `MAIL_DAILY_LIMIT`                     | no          | `50`                           | Default outbound messages per user per day (ceiling 500)                                                     |
| `MAIL_TRASH_DAYS`                      | no          | `7`                            | Age at which trashed mail is purged                                                                          |
| `MAIL_SITE_URL`                        | no          | `https://brockcsc.ca`          | Link target in the mail signature                                                                            |
| `ADMIN_MAIL_GROUP`                     | no          | `admin`                        | Stalwart group kept in sync with the current execs                                                           |
| `ADMIN_SUBDOMAIN` / `PUBLIC_SUBDOMAIN` | prod only   | unset                          | Enables the middleware host split                                                                            |
| `UPLOAD_DIR`                           | prod only   | —                              | `/data/uploads` in the container, backed by the `brockcsc-uploads` volume                                    |
| `PORT`                                 | no          | `3000`                         | Set by the Dockerfile                                                                                        |

`MAIL_DAILY_LIMIT`, `MAIL_TRASH_DAYS`, `MAIL_SITE_URL` and `ADMIN_MAIL_GROUP` are read by the code
but are not in `.env.example` — they run on their defaults everywhere. Add them there if you ever
need to override one.

## Database and migrations

Edit `lib/db/schema.ts`, then:

```bash
npm run db:generate      # writes drizzle/NNNN_*.sql — commit it
```

Every environment is a schema in one shared database (`DB_SCHEMA`), and migrations run per-schema on
container start (`CMD` in the `Dockerfile` runs `migrate.mjs`, then `sync-from-prod.mjs`, then the
server). Never hand-edit a generated migration that has already shipped.

`sync-from-prod.mjs` truncates `events`, `execs` and `signups` in the current schema and re-copies
them from `prod` on every deploy. It no-ops when `DB_SCHEMA` is `prod` or when no `prod` schema
exists. So preview and uat data is temporary — and anything you write to prod is not.

## Mail

Two separate JMAP clients, for two separate jobs.

**As the signed-in user** — `lib/mail/jmap-mail.ts`, used by everything under `app/api/mail/`.
A Keycloak refresh token is kept in the `brockcsc_refresh` httpOnly cookie and exchanged for a
short-lived access token per request (`lib/auth/mail-token.ts`), which is the JMAP `Bearer`. The app
never reads someone else's mailbox — Stalwart enforces the isolation, not us. The session lapses
after 30 minutes of inactivity, so the portal POSTs `/api/mail/keepalive` every 10 minutes while the
tab is visible.

**As an administrator** — `lib/mail/stalwart.ts`, Basic auth with `STALWART_ADMIN_USER/SECRET` and
Stalwart's `urn:stalwart:jmap` extension. Used only for provisioning accounts, group membership and
flipping a past exec's mailbox to read-only.

Message bodies are sanitised server-side (`lib/mail/sanitize.ts`, `isomorphic-dompurify`) and
rendered into a `<iframe sandbox="" srcDoc>` with its own CSP and `referrer-policy: no-referrer`.
Attachments are served through `/api/mail/blob/[blobId]`, which forces
`Content-Disposition: attachment`, rewrites `html|xml|svg|javascript` MIME types to
`application/octet-stream`, and sets `default-src 'none'; sandbox`. Keep it that way.

Send limits (`lib/mail/limit.ts`) count messages in the Sent mailbox since local midnight via
`Email/query … calculateTotal`, so mail sent from any other client counts too. Over the limit,
`POST /api/mail/send` returns **429**. Per-message caps: 100 KB text, 400 KB HTML, 20 attachments,
50 recipients, 15 MB per uploaded file.

The mail stack itself (`deploy/mail/docker-compose.yml`) is deployed by a **separate** workflow so
that website commits never bounce IMAP — see below.

## Deploys

Self-hosted, orchestrated by [Komodo](https://komo.do) through the reusable actions in
[`BrockCSC/komodo-deploy`](https://github.com/BrockCSC/komodo-deploy).

| Workflow                                              | Trigger                                             | What it does                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/deploy.yml` — **Build & Deploy**   | push to any branch, tags `v*`                       | lint + typecheck + `format:check`, syncs GitHub secrets into Komodo Variables, then builds and deploys a Stack |
| `.github/workflows/deploy-mail.yml` — **Deploy Mail** | push to `main` touching `deploy/mail/**`, or manual | deploys the single long-lived `brockcsc-mail` Stack                                                            |
| `.github/workflows/cleanup.yml` — **Cleanup**         | branch deleted                                      | deletes that branch's Komodo Stack and drops its `preview_*` schema                                            |

`komodo/deploy-context.mjs` decides the target from `GITHUB_REF` and prints the whole `KEY=VALUE`
environment block for the Stack. Secrets are never in the block — they are `[[BROCKCSC_NAME]]`
placeholders resolved by Komodo from its own Variables.

| Ref              | Stack                | Schema           | Where                       |
| ---------------- | -------------------- | ---------------- | --------------------------- |
| a tag            | `brockcsc-prod`      | `prod`           | brockcsc.ca                 |
| `main`           | `brockcsc-uat`       | `uat`            | an internal host            |
| any other branch | `brockcsc-pr-<slug>` | `preview_<slug>` | an internal per-branch host |

Preview and uat are deliberately not under `brockcsc.ca` — their databases are copies of prod, so
they should not be discoverable. A scheduled Komodo Action, `komodo/actions/preview-sweep.ts`
(registered by the `ensure-action` step and run daily at 09:00), tears down preview stacks and
schemas whose branch has been gone for three days, catching anything `cleanup.yml` missed.

## Adding an environment variable

Add it in **all four** places or deploys break:

1. `.env.example`
2. `.env.local.example` — if it is needed locally
3. `deploy/docker-compose.yml`
4. `komodo/deploy-context.mjs` — secrets as `[[BROCKCSC_NAME]]` placeholders

If it is a secret, it also needs a GitHub secret and a `sync_var` line in `deploy.yml`, and the
Komodo Variable must exist.

## Conventions and checks

- Comments only where they earn their place. Prefer the smaller change — more code is more to break.
- Arrow-function exports, `type` over `interface`, named exports.
- Gate every admin route with `requireAdmin` / `requireApprover` from `lib/auth/session.ts`.
- Never trust a client-side gate. `hidden` on a profile, role checks and limits are all enforced
  server-side as well.
- Run `npm run format` before pushing.

Before opening a PR:

```bash
npm run lint && npm run typecheck && npm run format:check && npm run build
```

CI runs the first three and will fail the deploy job if any of them do.

## Opening a pull request

Push a branch — it gets its own preview environment and its own `preview_<slug>` schema
automatically, and the environment URL appears on the workflow run. Fill in
`.github/pull_request_template.md`, including how a reviewer can actually test it and whether it
needs a role or an env var that does not exist yet.

Deleting the branch tears the preview down. Merging to `main` deploys to uat; tagging deploys to
production.
