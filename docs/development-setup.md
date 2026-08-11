# Development Setup

## Prerequisites

- Node.js 20+ (repo was built and verified against Node 22)
- npm 10+
- Git
- **Docker Desktop, running** — required for the local Supabase stack
  (`supabase start`). Not optional as of Phase 1: the app now depends on
  Supabase Auth + Postgres to run at all.

## First-time setup

```bash
git clone <repo-url>
cd opspilot-ai-automation
npm install
cp .env.example .env.local
```

## Database

The local Supabase stack (Postgres + Auth + Studio) runs via the Supabase
CLI (installed as a devDependency, invoked through `npx`/`npm run`):

```bash
npm run db:start   # first run downloads local Supabase Docker images
```

`db:start` prints an API URL, anon key, and service role key. Copy those
into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed value>
SUPABASE_SERVICE_ROLE_KEY=<printed value>
```

Then apply every migration plus the labeled dev seed data:

```bash
npm run db:reset
```

This is the "reproduce the database from scratch" path: `supabase/migrations/*.sql` in
order, then `supabase/seed.sql`. Re-run it any time you want a clean local database.

Seed data (from `supabase/seed.sql`) creates two organizations for testing tenant
isolation, with password `DemoPass123!` for all three demo users:

| Email                 | Organization      | Role   |
| --------------------- | ----------------- | ------ |
| `owner@acme-ops.dev`  | Acme Ops          | owner  |
| `member@acme-ops.dev` | Acme Ops          | member |
| `owner@globex.dev`    | Globex Industries | owner  |

Other useful commands: `npm run db:stop`, `npm run db:types` (regenerates
`lib/supabase/database.types.ts` from the running local schema).

> This project ships with a hand-written `lib/supabase/database.types.ts` that
> mirrors the migrations. If you add/change a migration, regenerate it with
> `npm run db:types` rather than hand-editing further.

## Running locally

```bash
npm run dev
```

The app serves at [http://localhost:3000](http://localhost:3000). Visit
[/signup](http://localhost:3000/signup) to create a workspace, or sign in
with one of the seed accounts above at [/login](http://localhost:3000/login).

## Checks

```bash
npm run lint           # ESLint
npm run format:check   # Prettier, check-only
npm run build           # Production build (also type-checks)
```

Run `npm run format` to auto-fix formatting issues.

## Testing

Vitest is configured as two projects (`vitest.config.ts`):

```bash
npm test                 # unit only — pure logic, no external dependencies, safe for CI
npm run test:integration # requires the local Supabase stack (db:start + db:reset first)
npm run test:watch       # either, in watch mode
```

Unit tests (`tests/unit/`) cover Zod schemas and the route-protection decision logic —
no database, no network. Integration tests (`tests/integration/`) run against a real
local Supabase instance (not mocked) and exercise the actual RLS policies: the auth
boundary, cross-organization isolation, and lead creation. They throw a clear setup
error immediately if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't
set, rather than failing with an opaque network error partway through.

Playwright (E2E) is part of the target stack but not configured yet — added once there's
a UI flow substantial enough to warrant browser-level testing. See
[tests/README.md](../tests/README.md).

## Docker

A `Dockerfile` (multi-stage, production build) and `docker-compose.yml` (the Next.js app
only, for now) are provided for containerized runs:

```bash
docker compose up --build
```

Services for n8n and any local infrastructure will be added to `docker-compose.yml` once
those phases begin — they aren't included yet to avoid implying integrations exist before
they do.

## Project structure

See [architecture.md](architecture.md) for the full breakdown of `app/`, `components/`,
`lib/`, `services/`, `workflows/`, and `database/`.
