## What & why

<!-- What changes, and what problem it solves. Link an issue if there is one. -->

## How to test

<!-- Steps a reviewer can actually follow. Note if it needs a Keycloak account,
     an admin role, or Komodo env vars that do not exist yet. -->

## Checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- [ ] `npm run build` passes
- [ ] New env vars added to `.env.example`, `deploy/docker-compose.yml` and `komodo/deploy-context.mjs`
- [ ] Schema changes have a generated migration (`npm run db:generate`)
- [ ] Admin-only routes are gated with `requireAdmin` / `requireApprover`
- [ ] No secrets in committed files
