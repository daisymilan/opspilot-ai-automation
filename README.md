# OpsPilot

An AI-powered business operations automation platform. OpsPilot demonstrates how a
real business can automate repetitive operations using event-driven workflows, n8n,
REST APIs/webhooks, AI/LLMs with structured outputs, database automation, human-in-the-loop
approvals, retries and failure recovery, execution monitoring, audit logging, and business
analytics.

> **Status: Phase 0 — Foundation.** The application shell, project structure, and tooling
> are in place. Business logic, workflows, database schema, and integrations are not yet
> implemented — see [docs/architecture.md](docs/architecture.md) for the phased plan.

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
├── app/          Next.js App Router routes and layouts
├── components/   UI components (components/ui = presentational primitives)
├── lib/          Framework-agnostic, domain-agnostic utilities
├── services/     Business logic: AI adapters, scoring, DB access, approvals
├── workflows/    n8n workflow definitions and documentation
├── database/     Supabase schema and migrations
├── tests/        Vitest and Playwright test suites
├── docs/         Architecture and setup documentation
└── public/       Static assets
```

See [docs/architecture.md](docs/architecture.md) for the reasoning behind this structure.

## Getting started

See [docs/development-setup.md](docs/development-setup.md) for full setup instructions.

```bash
npm install
cp .env.example .env.local   # fill in real values as they become available
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the development server     |
| `npm run build`        | Production build                 |
| `npm run start`        | Run the production build         |
| `npm run lint`         | Lint with ESLint                 |
| `npm run format`       | Format with Prettier             |
| `npm run format:check` | Check formatting without writing |

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

## License

Unlicensed — portfolio project.
