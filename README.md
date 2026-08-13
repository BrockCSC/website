<div align="center">

<img src="public/logo.svg" alt="Brock CSC" width="96" height="96" />

<br />
<br />

<img src="public/readme/banner.svg" alt="Brock Computer Science Club — Code. Connect. Create." width="820" />

<br />

**The home of the Brock University Computer Science Club on the web.**
A community of 900+ students who code, connect, and create together.

<br />

<img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white&labelColor=000000" alt="Next.js" />
<img src="https://img.shields.io/badge/React-19-9A4440?style=for-the-badge&logo=react&logoColor=white&labelColor=000000" alt="React" />
<img src="https://img.shields.io/badge/TypeScript-5-9A4440?style=for-the-badge&logo=typescript&logoColor=white&labelColor=000000" alt="TypeScript" />
<img src="https://img.shields.io/badge/Tailwind_CSS-4-9A4440?style=for-the-badge&logo=tailwindcss&logoColor=white&labelColor=000000" alt="Tailwind CSS" />
<img src="https://img.shields.io/badge/Drizzle_ORM-9A4440?style=for-the-badge&logo=drizzle&logoColor=white&labelColor=000000" alt="Drizzle ORM" />
<img src="https://img.shields.io/badge/PostgreSQL-9A4440?style=for-the-badge&logo=postgresql&logoColor=white&labelColor=000000" alt="PostgreSQL" />
<img src="https://img.shields.io/badge/Keycloak-9A4440?style=for-the-badge&logo=keycloak&logoColor=white&labelColor=000000" alt="Keycloak" />

</div>

<br />

## What's inside

One Next.js app: the club's public site, plus the tools the execs use to keep it running.

<table width="100%">
  <tr>
    <td width="88" align="center" valign="middle"><img src="public/readme/icon-home.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>Home</strong><br />
      The landing page. A hero, the current execs, and whatever's coming up next.
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle"><img src="public/readme/icon-events.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>Events</strong><br />
      Handles one-off events and recurring ones, weekly, biweekly or monthly. Everything's worked out against Toronto time and split into what's happening now, what's coming up, and what already happened.
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle"><img src="public/readme/icon-team.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>Team</strong><br />
      The current execs, sorted by role. Past execs get their own wall too, with a short bio and their socials.
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle"><img src="public/readme/icon-cs-guide.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>CS Guide</strong><br />
      A guide written by students, for students. Course codes, credit types, program requirements, that kind of thing.
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle"><img src="public/readme/icon-links.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>Links</strong><br />
      Discord, Instagram, GitHub, LinkedIn, ExperienceBU, all in one place.
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle"><img src="public/readme/icon-admin.svg" alt="" width="64" height="64" /></td>
    <td valign="middle">
      <strong>Admin CMS</strong><br />
      Where execs add and edit events and team members. Locked behind Keycloak, no database access needed.
    </td>
  </tr>
</table>

<br />

## The look

The whole site leans neubrutalist: flat colours, thick black outlines, and hard shadows offset in brand red (`#9A4440`) or black. No gradients, no blur. Buttons press down when you click them, cards lift on hover, and the member badge bobs.

<br />

## Local development

You need Node 22+, Docker (for the local Postgres), and the Keycloak client secret.

Production Postgres lives on the VPS and isn't reachable from your machine, so local dev runs its own throwaway Postgres in Docker. Keycloak is public, so you log in against the real thing.

```bash
git clone git@github.com:BrockCSC/website.git && cd website
npm ci
npm run db:up                       # local Postgres 16 on :5432
cp .env.local.example .env.local    # then fill in KEYCLOAK_CLIENT_SECRET
npm run dev                         # migrations run first, then http://localhost:3000
```

Open `http://localhost:3000/admin` and the login form appears. Sign in with your real Keycloak username and password.

**The client secret.** `KEYCLOAK_CLIENT_SECRET` is the one value you can't make up. Ask a club admin for it, or copy it out of the Komodo stack config. It never goes in a committed file — `.env.local` is gitignored, keep it that way.

**You also need the admin role.** A correct password isn't enough. Your Keycloak account needs the `brockcsc-admin` realm role, or login fails with a 403 "Not authorized". If that happens, ask an admin to grant you the role in the `brockcsc` realm.

The session cookie is `Secure`, which Chrome and Firefox happily set on `http://localhost`. Safari doesn't, so use Chrome or Firefox locally.

`npm run db:down` stops the database. Data lives in a named Docker volume, so it survives restarts. Local dev writes to the `local` schema, entirely separate from `prod` and `uat`.

<br />

<div align="center">

## Come say hi

[![Discord](https://img.shields.io/badge/Discord-Join_us-9A4440?style=for-the-badge&logo=discord&logoColor=white&labelColor=000000)](https://discord.com/invite/qsctEK2)
[![Instagram](https://img.shields.io/badge/Instagram-@brockcsc-9A4440?style=for-the-badge&logo=instagram&logoColor=white&labelColor=000000)](https://www.instagram.com/brockcsc/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Brock_CSC-9A4440?style=for-the-badge&logo=linkedin&logoColor=white&labelColor=000000)](https://www.linkedin.com/company/brockcsc)

<br />

<sub>Built by students, for students · Running on a self-hosted VPS via Komodo</sub>

</div>
