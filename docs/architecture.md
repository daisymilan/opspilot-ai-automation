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
              │ (+ Auth)           │          │  Claude (primary)      │
              │                    │          │  OpenAI (fallback)     │
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
- **`lib/`** owns generic, domain-agnostic helpers used by both `app/` and `services/`.

## The four core workflows (target shape)

Each of these will be implemented incrementally, workflow by workflow, in later phases —
not built simultaneously.

1. **AI Lead Intelligence** — Lead Created → Validate → Normalize → Duplicate Check →
   AI Classification → Lead Scoring → Recommended Action → Database → Assignment →
   Follow-up Draft → Human Approval (when required) → Execute Action → Audit Log
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
This is what powers the Executions and Dashboard pages later.

## Failure handling

The system is designed to handle, not ignore: upstream API failures, HTTP 429/rate
limiting, timeouts, malformed AI output, schema validation failures, duplicate records,
authentication failures, and partial workflow failures (some steps succeed, some don't).

## External integrations

Every external integration (AI providers, Supabase, n8n, and anything beyond) is accessed
through a documented adapter/interface in `services/`, with an explicit, clearly-labeled
development mode when real credentials aren't configured. Integrations are never silently
faked — a missing integration fails loudly or is visibly stubbed, never presented as real.

## Data model (planned, not yet implemented)

Entities anticipated in `database/`: `users`, `organizations`, `leads`, `lead_scores`,
`meetings`, `meeting_action_items`, `documents`, `document_extractions`, `approvals`,
`workflow_executions`, `workflow_errors`, `ai_generations`, `notifications`, `audit_logs`,
`integrations`. These will be introduced incrementally alongside the workflow that needs
them, not created wholesale up front.

## Phasing

- **Phase 0 (this phase)** — repository, tooling, app shell, documentation. No business
  logic, no schema, no auth, no integrations.
- **Later phases** — database schema and Supabase setup, authentication, one core workflow
  at a time (Lead Intelligence → Meeting Intelligence → Document Intelligence → Reporting),
  n8n workflow definitions, and the dashboard/analytics views that depend on real execution
  data.

Each phase is expected to be verified (tests, build, manual check) before the next begins.
