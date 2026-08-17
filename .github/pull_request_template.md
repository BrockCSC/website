## What & why

<!-- What changes, and what problem it solves. Link an issue if there is one. -->

## How to test

<!-- Steps a reviewer can actually follow, on the branch's preview environment where
     possible. Note if it needs a Keycloak account, a particular realm role, a mailbox,
     or Komodo env vars that do not exist yet. -->

## Checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- [ ] `npm run build` passes
- [ ] New env vars added to `.env.example`, `.env.local.example`, `deploy/docker-compose.yml` and `komodo/deploy-context.mjs`
- [ ] Schema changes have a generated migration (`npm run db:generate`), committed
- [ ] Admin-only routes are gated with `requireAdmin` / `requireApprover`
- [ ] Checked in both light and dark themes
- [ ] No secrets, internal hostnames or IPs in committed files
