# AI Lead Intelligence

Phase 2's vertical slice: a lead submitted through the app is persisted, handed to n8n,
analyzed by Claude with strictly-validated structured output, scored against business
rules, and — when the recommended action is high-risk or the AI wasn't confident — routed
to a human approval queue. Every step is observable (`workflow_executions`) and audited
(`audit_logs`).

## End-to-end flow

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant A as Next.js Server Action
    participant DB as Supabase Postgres
    participant N as n8n
    participant R as /api/leads/:id/analyze
    participant C as Claude

    U->>A: Submit "Create Lead" form
    A->>DB: insert leads (RLS, user session)
    A->>DB: insert workflow_executions (status=running, service role)
    A->>DB: insert audit_logs "lead.created" (service role)
    A->>N: POST /webhook/lead-intelligence (X-Webhook-Secret)
    N->>N: validate payload shape
    N->>R: POST /api/leads/:id/analyze (X-Webhook-Secret, executionId)
    R->>DB: fetch lead (service role; org derived from the row, never trusted from payload)
    R->>DB: check for an existing lead_scores row (idempotency)
    R->>C: analyze lead (forced structured tool output)
    C-->>R: structured analysis
    R->>R: Zod-validate output
    R->>R: apply business rules (confidence threshold, high-risk actions)
    R->>DB: insert lead_scores (service role)
    R->>DB: insert approvals if required (service role)
    R->>DB: update workflow_executions (succeeded / waiting_approval / failed)
    R->>DB: insert audit_logs (ai_analysis.generated, lead.recommendation_created, approval.requested)
    R-->>N: {success, leadScoreId, requiresApproval, recommendedAction}
    N-->>A: forwards the same response
    A-->>U: redirect to /leads/:id
    U->>DB: page reads lead + lead_scores + workflow_executions + approvals (RLS)
```

## Responsibility boundary: n8n vs. the application

**n8n's job is orchestration only** — receiving the webhook, light payload-shape
validation, calling the application, and returning the result. It does **not**
reimplement business logic. Every substantive step (duplicate/idempotency check, the
Claude call, output validation, business rules, persistence, approval creation,
execution/audit updates) runs in one place: `services/leads/analyzeLeadPipeline.ts`,
invoked by `app/api/leads/[id]/analyze`.

This is a deliberate deviation from a "10 independent business-logic nodes" workflow
shape: splitting validation/business-rules/persistence into separate n8n nodes would mean
either duplicating that logic in n8n (out of sync risk, no Zod, no transactional
guarantees) or chaining multiple round-trips for what should be one atomic operation. The
five real nodes in `workflows/lead-intelligence.json`:

| Node                         | Type                  | Does                                                          |
| ---------------------------- | --------------------- | ------------------------------------------------------------- |
| `01 Receive Lead`            | Webhook (Header Auth) | Entry point, authenticated                                    |
| `02 Validate Input`          | If                    | Payload shape only (`leadId`/`executionId` present)           |
| `03 Analyze Lead`            | HTTP Request          | Calls the app; this is where all business logic actually runs |
| `04 Respond With Result`     | Respond to Webhook    | Forwards the app's response verbatim                          |
| `05 Respond Invalid Request` | Respond to Webhook    | 400 for malformed payloads                                    |

## AI architecture

- **Provider abstraction** (`services/ai/types.ts`): the app depends on `AIProvider`
  (`analyzeLead(input): Promise<LeadAnalysis>`), not on the Anthropic SDK directly.
- **`ClaudeProvider`** (`services/ai/providers/claudeProvider.ts`): the real
  implementation. Uses forced tool-use (`tool_choice: {type: "tool", ...}`) rather than
  asking the model to "output JSON" in prose — the reliable way to get structured output
  from Claude. Throws `AIConfigurationError` immediately if `ANTHROPIC_API_KEY` is unset —
  **no fallback or demo data is ever generated**.
- **`DeterministicTestProvider`** (`services/ai/providers/deterministicTestProvider.ts`):
  rule-based, not AI, used only in tests. Its `model` field is literally
  `"deterministic-test-provider"` so it can never be mistaken for a real result in a UI
  or audit log — `services/leads/analyzeLeadPipeline.ts` records whichever provider's
  `model`/`promptVersion` actually ran.
- **Prompt versioning** (`services/ai/prompts/leadAnalysis.ts`): `LEAD_ANALYSIS_PROMPT_VERSION`
  is bumped whenever the prompt or tool schema changes, and stored on every `lead_scores`
  row alongside `model` — you can always trace a result back to exactly what produced it.

### Structured output validation

`services/ai/schema.ts` (`leadAnalysisSchema`, Zod) is the actual enforcement — the tool
JSON Schema only steers the model. Every field is bounded or a controlled enum, never an
arbitrary string for a business state:

| Field                | Constraint                                                                     |
| -------------------- | ------------------------------------------------------------------------------ |
| `score`              | integer, 0–100                                                                 |
| `confidence`         | number, 0–1                                                                    |
| `priority`           | `low` \| `medium` \| `high`                                                    |
| `recommended_action` | `schedule_call` \| `send_follow_up` \| `assign_sales_owner` \| `manual_review` |
| `reasoning_summary`  | non-empty, ≤1000 chars                                                         |

If Claude's tool call doesn't parse against this schema, the pipeline fails the execution
loudly (`AIOutputValidationError`) — it never falls back to a partially-valid or
default result.

**Prompt injection**: the lead's own `message` field is untrusted user input. The system
prompt explicitly instructs Claude to treat it as data, not instructions
(`services/ai/prompts/leadAnalysis.ts`). Nothing in the pipeline lets the AI's output
directly cause a side effect beyond writing a `lead_scores` row — every subsequent action
still passes through business rules and, where required, human approval.

## Business rules

`services/leads/businessRules.ts` — pure, synchronous, fully unit-tested. AI output is
never auto-trusted:

- **Confidence below `AI_CONFIDENCE_THRESHOLD`** (default `0.7`) → approval required.
- **`schedule_call` or `assign_sales_owner`** → approval required regardless of
  confidence — these commit sales resources. `send_follow_up` and `manual_review` don't.

## Human approval

Uses the existing `approvals` table from Phase 1 unmodified. When required, the pipeline
inserts one row (`entity_type='lead'`, `action_type=<recommended action>`,
`status='pending'`) via the service role. The lead detail page (`/leads/:id`) shows
pending/approved/rejected state. A full approval _center_ (reviewing/deciding from the
UI) is out of scope for Phase 2 — Phase 1's `approvals_update_reviewer` RLS policy
(owner/admin only) already governs who _could_ act on one.

## Execution tracking

Every run gets one `workflow_executions` row, created by the triggering server action
(`status='running'`) and updated by the pipeline to its terminal state:

- `succeeded` — analysis completed, no approval needed
- `waiting_approval` — analysis completed, approval created
- `failed` — any error (see below), with `error_message` set and no secrets in it

`waiting_approval` is a Phase 2 addition to the status check constraint (new migration —
the original Phase 1 values, including `succeeded`, are unchanged).

## Audit logging

Written via `services/audit/recordAuditEvent.ts`, always with the service-role client —
`audit_logs` remains service-role-write-only and append-only exactly as Phase 1 defined
it; no RLS was widened. Events recorded: `lead.created`, `ai_analysis.generated`,
`lead.recommendation_created`, and (when applicable) `approval.requested`.

## Error handling

| Failure                                                              | Where                                    | Behavior                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid lead input                                                   | `services/leads/schema.ts` (Zod)         | Rejected before any DB write                                                                                                                                                                                                                                                                               |
| Duplicate lead (same email in org)                                   | DB unique constraint (Phase 1)           | Insert fails, surfaced to the form                                                                                                                                                                                                                                                                         |
| Duplicate **analysis** (retried webhook)                             | `analyzeLeadPipeline.ts`                 | Idempotent — returns the existing `lead_scores` row and the lead's real current state (e.g. still `waiting_approval` if an approval is still pending), no second AI call                                                                                                                                   |
| AI API failure / timeout                                             | `ClaudeProvider` (30s timeout)           | `AIProviderError` → execution `failed`                                                                                                                                                                                                                                                                     |
| Invalid AI response                                                  | `ClaudeProvider` (Zod)                   | `AIOutputValidationError` → execution `failed`                                                                                                                                                                                                                                                             |
| Business-rule evaluation                                             | `businessRules.ts`                       | Pure function over already-validated input; not a failure surface                                                                                                                                                                                                                                          |
| Database failure                                                     | Every Supabase call's `error` is checked | Execution `failed`, error message never includes secrets                                                                                                                                                                                                                                                   |
| n8n unreachable/misconfigured                                        | `services/n8n/triggerWorkflow.ts`        | Lead still created; execution `failed` with a clear reason — **verified live** by stopping/misconfiguring the target                                                                                                                                                                                       |
| n8n reachable, but the pipeline itself failed (e.g. missing API key) | `services/n8n/triggerWorkflow.ts`        | n8n's HTTP 422 is treated as a legitimate result, not an n8n failure — the pipeline's own precise error is preserved on the execution record rather than overwritten with a generic "webhook failed" message. (Found and fixed via a live test that traced the actual DB row, not just the rendered page.) |

## Security

- **Tenant isolation**: `lead_scores` has the same RLS shape as `workflow_executions` —
  `authenticated` gets `SELECT` only, scoped to `current_org_id()`; all writes are
  service-role only. A client cannot forge an "AI-generated" score. Verified in
  `tests/integration/lead-intelligence.test.ts`.
- **Server/client boundary**: `lib/supabase/serviceRole.ts` is guarded with the
  `server-only` package — it throws a build error if ever imported into client code. The
  service role key never reaches the browser.
- **Webhook authentication** (both directions), one shared secret (`N8N_WEBHOOK_SECRET`):
  - App → n8n: sent as an `X-Webhook-Secret` header; n8n's Webhook node is configured
    with a matching **Header Auth** credential and rejects anything else.
  - n8n → app: `app/api/leads/[id]/analyze` checks the same header with
    `crypto.timingSafeEqual` (constant-time comparison) before doing anything, and fails
    closed (500) if the secret isn't configured server-side at all.
- **Organization boundary**: the analyze endpoint derives `organization_id` from the
  fetched `leads` row — never from the webhook payload — so a crafted payload can't
  analyze a lead into the wrong tenant's data.

## Local setup

### 1. AI

```
ANTHROPIC_API_KEY=<your key>       # console.anthropic.com — required, no fallback
ANTHROPIC_MODEL=claude-sonnet-5
AI_CONFIDENCE_THRESHOLD=0.7
```

### 2. n8n

```bash
docker compose up -d n8n
```

Required env vars (`.env.example`): `N8N_ENCRYPTION_KEY`, `N8N_WEBHOOK_SECRET`,
`APP_BASE_URL` (how n8n, in Docker, reaches the app running via `npm run dev` on the
host — defaults to `http://host.docker.internal:3000`).

On first launch, n8n requires one-time interactive setup (its Community Edition has no
headless bootstrap path for normal use):

1. Open `http://localhost:5678` and create the owner account.
2. **Workflows → Import from File** → `workflows/lead-intelligence.json`.
3. Create a credential: **Credentials → New → Header Auth**, name it
   `OpsPilot Webhook Secret`, header name `X-Webhook-Secret`, value = your
   `N8N_WEBHOOK_SECRET`.
4. Open the imported workflow, attach that credential to the `01 Receive Lead` node.
5. Activate the workflow (toggle in the top right).

> **What was actually verified in this session, and how.** I could script steps 1–5
> programmatically via n8n's own REST API (`/rest/owner/setup`, `/rest/login`,
> `/rest/credentials`, `PATCH /rest/workflows/:id`) specifically to _prove_ the workflow
> works end to end, then fired a real webhook with `curl` and confirmed the full chain:
> n8n auth → payload validation → real HTTP call into `/api/leads/:id/analyze` → real
> webhook-secret check → real Postgres lookups → `ClaudeProvider` correctly refusing to
> run without `ANTHROPIC_API_KEY` → `workflow_executions` updated to `failed` with that
> exact message → the response propagated back through n8n to the original caller. I also
> exercised the real "Create Lead" UI form (via its actual Server Action) end to end the
> same way and confirmed `/leads/:id` renders the result correctly. What I could **not**
> verify: an actual Claude API call, since no `ANTHROPIC_API_KEY` is available in this
> environment — set one and re-run the same flow to confirm the full AI round trip.
>
> One CLI quirk worth knowing: this n8n version's `import:workflow --input=file.json`
> requires the file to be a JSON **array** of workflows (`[{...}]`), even for a single
> workflow, despite the CLI's own `--help` example showing a bare object — that's why
> `workflows/lead-intelligence.json` is array-wrapped. Importing via the web UI does not
> have this requirement either way.

### 3. Verify

```bash
npm run db:reset        # applies the Phase 2 migrations
npm run dev              # in one terminal
docker compose up -d n8n # in another
```

Sign in (see `docs/development-setup.md` for seed accounts), go to **Leads**, create one
with a message like _"we need to automate this urgently"_ — with a real `ANTHROPIC_API_KEY`
configured, you should see a real Claude-generated analysis on the lead's detail page
within a few seconds; check `workflow_executions`/`audit_logs` in Supabase Studio
(`http://localhost:54323`) to see the full trail.
