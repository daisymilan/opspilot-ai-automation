# OpsPilot Architecture

## Purpose

OpsPilot is a portfolio-grade demonstration of AI-powered business operations automation:
event-driven workflows, n8n orchestration, REST APIs/webhooks, structured AI outputs,
database automation, human-in-the-loop approval, retries/failure recovery, execution
monitoring, audit logging, and business analytics.

## System shape

```
                        ┌───────────────────────────┐
   External triggers →  │           n8n              │  ← orchestration, retries,
   (forms, webhooks,     │  (workflow orchestration)  │    scheduling, 3rd-party APIs
    voice notes, files)  └─────────────┬─────────────┘
                                        │ calls into
                                        ▼
                        ┌───────────────────────────┐
                        │   Next.js app (this repo)  │
                        │                             │
                        │  app/        → UI + routes  │
                        │  services/   → business      │
                        │                logic, AI     │
                        │                adapters,     │
                        │                DB access      │
                        │  lib/        → generic utils  │
                        └─────────────┬─────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                                ▼
              ┌───────────────────┐          ┌───────────────────────┐
              │ Supabase Postgres  │          │  AI providers          │
              │ (+ Auth)           │          │  Claude (implemented)  │
              │                    │          │  OpenAI (reserved,     │
              │                    │          │  not implemented)      │
              └───────────────────┘          └───────────────────────┘
```

**Division of responsibility**

- **n8n** owns orchestration: receiving triggers, scheduling, retries/backoff, and calling
  third-party systems. It calls into the Next.js app's API routes for anything that needs
  business logic or AI.
- **`services/`** owns business logic: AI provider adapters, Zod-validated structured
  output, lead scoring, business-rule evaluation, database access, and audit logging.
  This layer is orchestration-agnostic — it doesn't know whether it was called by n8n,
  an API route, or a test.
- **`app/`** owns presentation and routing: pages read/display state and call `services/`
  for anything domain-specific. No business logic lives in components.
- **`lib/`** owns generic, domain-agnostic helpers used by both `app/` and `services/` —
  including the Supabase client/server/middleware setup (`lib/supabase/`) and the pure
  route-protection decision (`lib/auth/route-guard.ts`).

## The four core workflows

Each of these is implemented incrementally, workflow by workflow — not built
simultaneously.

1. **AI Lead Intelligence** — **implemented, Phase 2.** Lead Created → Persist →
   Trigger n8n → Validate → Duplicate/Idempotency Check → AI Analyze → Validate
   Structured Output → Business Rules → Recommended Action → Human Approval (when
   required) → Execution + Audit Log. See [lead-intelligence.md](lead-intelligence.md)
   for the full architecture, sequence diagram, and security model. The human-approval
   step and execution history are now reviewable from a real UI (Dashboard, Approval
   Center, Execution Explorer) — see [operations-center.md](operations-center.md).
2. **AI Meeting Intelligence** — Meeting/transcript → AI Summary → Extract Action Items →
   Identify Owners → Identify Dates → Generate Follow-up Draft → Human Review → Approval →
   Action → Audit Log
3. **AI Document Intelligence** — Upload → Storage → Text Extraction → AI Analysis →
   Structured Output → Zod Validation → Database → Human Review (when appropriate) →
   Audit Log
4. **Automated Business Reporting** — Aggregate execution/lead/approval metrics → AI-assisted
   operations summary

## The human-in-the-loop gate

No AI output triggers a sensitive business action directly. Every such path follows:

```
AI → Structured Output → Schema Validation (Zod) → Business Rules
   → Confidence Check → Human Approval (when required) → Action → Audit Log
```

"When required" is a business-rule decision (e.g. confidence threshold, action
sensitivity) — not every AI output needs human approval, but every sensitive one does,
and the decision itself is logged.

## Observability

Every meaningful automation execution is recorded with: workflow name, entity, status,
start time, completion time, duration, retry count, error (if any), and relevant metadata.
This powers the real Dashboard, Approval Center, and Execution Explorer pages — see
[operations-center.md](operations-center.md).

## Failure handling

The system is designed to handle, not ignore: upstream API failures, HTTP 429/rate
limiting, timeouts, malformed AI output, schema validation failures, duplicate records,
authentication failures, and partial workflow failures (some steps succeed, some don't).

## External integrations

Every external integration (AI providers, Supabase, n8n, and anything beyond) is accessed
through a documented adapter/interface in `services/`, with an explicit, clearly-labeled
development mode when real credentials aren't configured. Integrations are never silently
faked — a missing integration fails loudly or is visibly stubbed, never presented as real.

## Data model

`organizations`, `profiles`, `leads` (Phase 1), plus `lead_scores` (Phase 2) exist — see
[Database architecture](#database-architecture) below. Still planned for later phases,
introduced alongside the workflow that needs them: `meetings`, `meeting_action_items`,
`documents`, `document_extractions`, `ai_generations`, `notifications`, `integrations`.

## Database architecture

Schema lives under [`supabase/migrations/`](../supabase/migrations/), not
`database/` — the Supabase CLI (`supabase start`, `db reset`, `db push`)
requires that fixed path to give genuine "reproduce the database from
scratch" tooling instead of hand-copied SQL. `database/README.md` documents
the resulting data model; the migrations themselves are the source of truth.
See [database/README.md](../database/README.md) for the entity list and
relationships, and [development-setup.md](development-setup.md#database) for
how to apply them locally.

## Organization / tenant model

OpsPilot is multi-tenant: every user belongs to exactly one `organization`
via `profiles.organization_id`, and every business record (`leads`,
`workflow_executions`, `approvals`, `audit_logs`) carries its own
`organization_id`. Signing up creates a brand-new organization — there is no
"join an existing org" flow yet (planned for a later phase, once invites
exist). The first user of an organization is its `owner`.

Organization/profile creation is atomic: the client sends `organization_name`
and `full_name` as Supabase Auth signup metadata, and a Postgres trigger
(`handle_new_user`, on `auth.users`) creates both the organization and the
owner's profile inside the same transaction as the auth user. This avoids a
partial-failure window where a user exists without an organization or vice
versa, which two separate client-side inserts could not guarantee.

## RLS strategy

**Row Level Security is the enforcement boundary, not the frontend.** Every
organization-owned table has RLS enabled, and every policy checks against a
single function, `current_org_id()` (`SECURITY DEFINER`, resolves
`auth.uid()` → `profiles.organization_id`), rather than repeating that
lookup inline per policy.

Two gates apply to every table, and both must agree:

1. **Table-level GRANT** — which roles (`anon` / `authenticated` /
   `service_role`) may touch the table at all. Recent Supabase projects no
   longer auto-expose new tables to the Data API, so this is explicit in
   every migration, not assumed.
2. **RLS policy** — which _rows_ a role may see/write, once the GRANT
   already allows the operation.

None of the policies read "authenticated users can access everything."
Per-table shape:

| Table                 | authenticated may                                       | Notes                                                                                             |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `organizations`       | select own org; update own org (owner/admin only)       | insert only via the signup trigger                                                                |
| `profiles`            | select same-org profiles; update own row only           | `organization_id`/`role` changes blocked by a trigger, independent of RLS                         |
| `leads`               | full CRUD, own org only                                 | `organization_id` defaults to `current_org_id()`                                                  |
| `approvals`           | select/insert own org; update (review) owner/admin only | no delete — approvals are a permanent record                                                      |
| `workflow_executions` | select own org only                                     | insert/update reserved for the service role (system-generated telemetry)                          |
| `lead_scores`         | select own org only                                     | insert/update reserved for the service role — AI-generated data isn't client-writable             |
| `audit_logs`          | select own org only                                     | insert reserved for the service role; **no role** has update/delete — append-only by construction |

## Authentication architecture

Supabase Auth + `@supabase/ssr` for correct Next.js App Router cookie
handling:

- `lib/supabase/client.ts` — browser client, Client Components only.
- `lib/supabase/server.ts` — server client, Server Components/Actions/Route
  Handlers. Created fresh per request from `next/headers` cookies.
- `proxy.ts` (root, Next.js's post-v16 "proxy" convention — formerly
  `middleware.ts`) + `lib/supabase/middleware.ts` — refreshes the
  session cookie on every request and enforces route protection.
- `lib/auth/route-guard.ts` — the route-protection _decision_ as a pure
  function (`decideRoute(pathname, isAuthenticated)`), deliberately kept
  free of Next.js/Supabase so it's unit-testable without a running server or
  database.
- `services/auth/actions.ts` — the actual `signUp`/`signIn`/`signOut`
  Server Actions (Zod-validated input, calls Supabase Auth). UI components
  (`components/auth/*Form.tsx`) are thin: they call these actions and render
  the returned error, nothing more.

All three (`anon`, `authenticated`, `service_role`) Supabase API roles are
real Postgres roles — bypassing the frontend cannot bypass RLS, because RLS
is evaluated by Postgres itself for every query regardless of which client
issued it.

## Phasing

- **Phase 0** — repository, tooling, app shell, documentation. No business
  logic, no schema, no auth, no integrations.
- **Phase 1** — Supabase Postgres schema + RLS for the multi-tenant
  foundation (organizations, profiles, leads, workflow_executions,
  approvals, audit_logs), Supabase Auth (signup/signin/signout, protected
  routes), and a minimal Zod-validated lead-creation service. No AI, no
  n8n, no dashboard analytics yet.
- **Phase 2** — AI Lead Intelligence, the first full vertical
  slice: `lead_scores` table + RLS, a real Claude integration behind a
  provider-agnostic interface, n8n orchestration (`workflows/lead-intelligence.json`),
  business rules gating human approval, and a working `/leads` UI. See
  [lead-intelligence.md](lead-intelligence.md).
- **Phase 3** — Operations & Human Approval Center: a real Dashboard,
  Approval Center, and Execution Explorer built entirely on Phase 1/2 data — no new
  tables or migrations. Approve/reject with a database-enforced (not just
  application-enforced) reviewer boundary, a safe-by-construction retry, and an
  execution timeline built only from real audit events. See
  [operations-center.md](operations-center.md).
- **Phase 4 (this phase)** — Productionization: the same application deployed
  for real — GitHub → Vercel → Supabase Cloud → production n8n → Claude API.
  No new application features and no architecture changes; this phase is
  entirely about environment separation, hosted-database migration
  deployment, production auth/webhook configuration, and honest production
  verification. See [production-deployment.md](production-deployment.md).
- **Later phases** — Meeting Intelligence → Document Intelligence → Reporting.

Each phase is expected to be verified (tests, build, manual check) before the next begins.
