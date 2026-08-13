# Contributing

## Prerequisites

- Node 22.9+ (the dev scripts use `--env-file-if-exists`)
- Docker, for the local Postgres
- A Keycloak account in the `brockcsc` realm, if you need the admin panel

## Running locally

```bash
npm install
cp .env.local.example .env.local     # then fill in KEYCLOAK_CLIENT_SECRET
npm run db:up                        # local Postgres on :5432
npm run dev                          # migrates, then starts on :3000
```

`npm run dev` runs migrations first. If `DATABASE_URL` is missing it stops with a
message rather than starting against a broken database.

A fresh local schema is **empty** — no events, no execs. `scripts/sync-from-prod.mjs`
only works inside the deployed database, so populate local data by hand through
the admin panel.

## Connecting to Keycloak

Auth is a direct password grant against the shared Keycloak at
`https://auth.wayfarerbx.com/realms/brockcsc`. It is reachable from anywhere, so
local login works against the real realm — no local Keycloak needed.

You need two things, and they are separate asks:

1. **`KEYCLOAK_CLIENT_SECRET`** for the `brockcsc-web` client. Get it from a club
   admin or the Komodo stack config. Never commit it.
2. **The `executive` realm role on your user.** Without it `/api/auth/login`
   returns 403 and you never get a session cookie at all — it is not a case of
   logging in and then being bounced. This catches people out.

### Testing admin features

| To test                      | You need                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| Own profile only             | `alumni`                                                          |
| Admin panel, events, profile | `executive`                                                       |
| Approving sign-ups           | `co-president` (composite, carries `brockcsc-approver`)           |
| Sign-up creating accounts    | `KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET` for `brockcsc-provisioner` |
| Everything, permanently      | `owner` (see below)                                               |

The `owner` realm role (`SUPERUSER_ROLE`) satisfies every role check, including
gates added after it was introduced — the check lives in `requireRole`, so new
gates inherit it for free. It is a realm role rather than a hardcoded username so
it can be revoked from Keycloak like any other. Grant it sparingly.

The `brockcsc-provisioner` service account holds `manage-users` and `view-realm`.
It deliberately does **not** hold `manage-realm` — it runs at request time, so a
leaked secret should not be able to rewrite the realm's role model. Creating roles
is a one-off admin task, done by hand.

Sign-up creates the Keycloak user **disabled**, so a test signup cannot log in until
approved. Rejecting deletes the user. Both are real writes against the shared realm —
use obviously-fake names when testing, and clean up after yourself.

> Safari will not keep a local session: `sessionCookieOptions` sets `secure: true`
> unconditionally, and Safari rejects that over `http://localhost`. Use Chrome or Firefox.

Role changes take effect immediately — roles are read from Keycloak on each
request rather than from the session cookie, with a 15-second cache. If Keycloak
is unreachable, admin requests are denied rather than falling back to stale roles.

## Conventions

- Comments only where they earn their place. Prefer the smaller change.
- Arrow-function exports, `type` over `interface`, named exports.
- Run `npm run format` before pushing; CI runs `format:check`.

## Database changes

Edit `lib/db/schema.ts`, then:

```bash
npm run db:generate      # writes drizzle/NNNN_*.sql — commit it
```

Every environment is a schema in one shared database (`DB_SCHEMA`). Migrations run
per-schema on deploy. Never hand-edit a generated migration that has already shipped.

## New environment variables

Add them in all four places or deploys break:

1. `.env.example`
2. `.env.local.example`
3. `deploy/docker-compose.yml`
4. `komodo/deploy-context.mjs` — secrets as `[[BROCKCSC_NAME]]` placeholders, which
   must also be created in Komodo

## Branches and deploys

- Any branch push gets a preview environment and its own `preview_<slug>` schema
- `main` deploys to uat
- A tag deploys to prod

Preview and uat schemas are truncated and re-copied from prod on every deploy, so
test data there is temporary — and anything you write to prod is not.
