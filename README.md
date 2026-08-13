# OpsPilot

An AI-powered business operations automation platform. OpsPilot demonstrates how a
real business can automate repetitive operations using event-driven workflows, n8n,
REST APIs/webhooks, AI/LLMs with structured outputs, database automation, human-in-the-loop
approvals, retries and failure recovery, execution monitoring, audit logging, and business
analytics.

> **Status: Phase 2 — AI Lead Intelligence.** The first full vertical slice is working
> end to end: create a lead → n8n orchestrates → Claude analyzes it (real structured
> output, no fallback) → validated → business rules decide the action → human approval
> when required → execution and audit trail recorded. See
> [docs/lead-intelligence.md](docs/lead-intelligence.md) for the full architecture and
> [docs/architecture.md](docs/architecture.md) for the phased plan. Meeting/document
> intelligence, reporting, and the full dashboard are not yet implemented.

## Tech stack

| Layer                    | Choice                                  |
| ------------------------ | --------------------------------------- |
| Frontend                 | Next.js (App Router), React, TypeScript |
| Styling                  | Tailwind CSS                            |
| Database                 | Supabase (PostgreSQL)                   |
| Auth                     | Supabase Auth                           |
| Workflow orchestration   | n8n                                     |
| AI (primary)             | Claude                                  |
| AI (fallback)            | OpenAI                                  |
| Validation               | Zod                                     |
| Unit / integration tests | Vitest                                  |
| E2E tests                | Playwright                              |
| CI                       | GitHub Actions                          |
| Deployment               | Vercel (app), Docker (where useful)     |

## Project structure

```
opspilot/
├── app/          Next.js App Router routes, layouts, and API routes (app/api/leads/[id]/analyze)
├── components/   UI components (components/ui = presentational primitives)
├── lib/          Framework-agnostic utilities, incl. lib/supabase (client/server/service-role)
├── services/     Business logic: auth, leads, AI provider abstraction, business rules, n8n adapter, audit
├── workflows/    n8n workflow definitions (workflows/lead-intelligence.json)
├── supabase/     Migrations + seed data (source of truth for the schema)
├── database/     Human-readable data model docs pointing into supabase/
├── tests/        Vitest unit + integration suites (Playwright later)
├── docs/         Architecture, setup, and lead-intelligence documentation
├── proxy.ts      Session refresh + route protection (Next.js "proxy" convention)
├── docker-compose.yml  web + n8n services
└── public/       Static assets
```

See [docs/architecture.md](docs/architecture.md) for the reasoning behind this structure.

## Getting started

See [docs/development-setup.md](docs/development-setup.md) for full setup instructions,
including the local Supabase stack (requires Docker) and seed login credentials. For the
AI Lead Intelligence flow specifically (n8n + Claude), see
[docs/lead-intelligence.md](docs/lead-intelligence.md#local-setup).

```bash
npm install
cp .env.example .env.local
npm run db:start   # local Supabase (Postgres + Auth); requires Docker
npm run db:reset   # apply migrations + dev seed data; copy printed keys into .env.local
docker compose up -d n8n   # optional: only needed to trigger real lead analysis
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign up for a new workspace or sign
in with a [seed account](docs/development-setup.md#database).

## Scripts

| Command                        | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `npm run dev`                  | Start the development server                                  |
| `npm run build`                | Production build                                              |
| `npm run start`                | Run the production build                                      |
| `npm run lint`                 | Lint with ESLint                                              |
| `npm run format`               | Format with Prettier                                          |
| `npm run format:check`         | Check formatting without writing                              |
| `npm run db:start` / `db:stop` | Start/stop the local Supabase stack (Docker)                  |
| `npm run db:reset`             | Reproduce the database from scratch (migrations + seed)       |
| `npm run db:types`             | Regenerate `lib/supabase/database.types.ts`                   |
| `npm test`                     | Unit tests (no external dependencies)                         |
| `npm run test:integration`     | Integration tests against local Supabase (RLS, auth boundary) |

## Engineering principles

1. AI never blindly executes sensitive business actions — every sensitive action flows
   through structured output → schema validation → business rules → confidence check →
   human approval (when required) → action → audit log.
2. Every LLM response is validated against a Zod schema before use.
3. Every automation execution is observable (workflow, entity, status, timing, retries, errors).
4. Failure handling is realistic: API failures, rate limits, timeouts, malformed AI output,
   validation failures, duplicates, auth failures, partial workflow failures.
5. Secrets live in environment variables only — see `.env.example`.
6. External integrations are never faked silently; unavailable integrations get a documented
   adapter/interface and an explicit development mode.
7. Business logic stays out of the UI layer.
8. n8n owns orchestration and third-party integration; the TypeScript app owns business logic.
9. The AI provider is an injectable interface (`services/ai/types.ts`), not a hardcoded
   SDK call — tests use a `DeterministicTestProvider` that is never called "AI" in
   production and can never be mistaken for a real result (see
   [docs/lead-intelligence.md](docs/lead-intelligence.md#ai-architecture)).

## License

Unlicensed — portfolio project.
