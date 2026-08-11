# Development Setup

## Prerequisites

- Node.js 20+ (repo was built and verified against Node 22)
- npm 10+
- Git
- Docker (optional, for containerized runs — not required for local dev)

## First-time setup

```bash
git clone <repo-url>
cd opspilot-ai-automation
npm install
cp .env.example .env.local
```

`.env.local` is gitignored. In Phase 0, no environment variables are actually read by the
app yet — the file exists so the shape of required configuration is documented ahead of
the integrations that will consume it (Supabase, Claude, OpenAI, n8n).

## Running locally

```bash
npm run dev
```

The app serves at [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run lint           # ESLint
npm run format:check   # Prettier, check-only
npm run build           # Production build (also type-checks)
```

Run `npm run format` to auto-fix formatting issues.

## Testing

Vitest (unit/integration) and Playwright (E2E) are part of the target stack but are not
configured yet — they'll be added alongside the first testable business logic rather than
as empty scaffolding. See [tests/README.md](../tests/README.md).

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
