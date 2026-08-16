# Operations & Human Approval Center

Phase 3's vertical slice: an operations layer on top of the Phase 1/2 automation engine —
a Dashboard, an Approval Center, and an Execution Explorer with a full timeline — built
entirely on real data already produced by `services/leads/analyzeLeadPipeline.ts`. No new
tables, no new migrations: everything here reads and writes the same `workflow_executions`,
`approvals`, `lead_scores`, and `audit_logs` rows Phase 1/2 already defined.

## What this phase deliberately does not do

- **No emails or CRM mutations on approve/reject.** Approving or rejecting today only
  updates `approvals` and `workflow_executions` and writes an audit event — it does not
  contact a customer or an external CRM. That's future scope.
- **No live Claude health check.** The AI-provider health shown on the dashboard is never
  a live ping — see [AI provider health](#ai-provider-health) below for why and how it's
  derived instead.
- **Retry is intentionally narrow.** Only a `failed` execution of the `lead_intelligence`
  workflow can be retried — see [Retry](#retry).
- **The execution timeline is scoped by time window, not a stored link** — see
  [Execution timeline](#execution-timeline).

None of these are bugs to be quietly worked around; each is a disclosed scoping decision,
documented at the point in the UI/code where it matters.

## Dashboard (`/dashboard`)

`services/dashboard/getMetrics.ts` and `services/dashboard/getSystemHealth.ts` — every
number is a real aggregation over the caller's own RLS-scoped rows (`getDashboardMetrics`,
`getRecentExecutions`) or a real just-performed check (`getSystemHealth`). Nothing is
hard-coded, estimated, or a placeholder "coming soon" metric.

| Panel                  | Source                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Leads / analyses count | `count` queries against `leads` / `lead_scores`, RLS-scoped                         |
| Execution totals       | `summarizeExecutions()` (pure) over the org's real `workflow_executions` rows       |
| Average duration       | Computed from real `duration_ms` values only; `null` (shown as "—") if none exist   |
| Database health        | A real trivial `select` against `organizations`, timed by success/failure           |
| n8n health             | A real `fetch` to `${N8N_BASE_URL}/healthz` with a 3s timeout                       |
| AI provider health     | See below — derived, not pinged                                                     |
| Recent executions      | Real rows, newest first, with lead names resolved via a second query (no FK exists) |

### AI provider health

`services/dashboard/aiProviderHealth.ts` (`deriveAiProviderHealth`, pure and unit-tested)
deliberately does **not** call Claude on every dashboard load — that would cost real money
on every page view for a status indicator. Instead it's honestly derived from two real
signals:

1. Whether `ANTHROPIC_API_KEY` is configured at all (`not_configured` if not).
2. The most recent `lead_intelligence` execution's **real, already-recorded** outcome —
   `succeeded`/`waiting_approval` → `configured`; a `failed` execution's real
   `error_message` is pattern-matched (`classifyClaudeErrorMessage`) into
   `authentication_failure`, `billing_failure`, `unavailable`, or `unknown_error`.

Every result carries a `basedOn` field (`not_configured` / `no_recent_execution` /
`most_recent_execution`), and the dashboard always renders it next to the status badge —
the UI never implies a live check that didn't happen. `looksAiRelated()` guards against
misattributing an unrelated failure (e.g. a database error) to the AI provider.

This was built and tested against this project's own real captured failure: with a real
`ANTHROPIC_API_KEY` configured but insufficient account credit, the live Claude call
returned a genuine Anthropic `invalid_request_error` ("Your credit balance is too low to
access the Anthropic API"). `deriveAiProviderHealth` classifies that exact message as
`billing_failure` — see `tests/unit/ai-provider-health.test.ts`. The dashboard will
therefore honestly show **Billing failure** for this environment, not "Configured" and not
a fabricated "Healthy" — that would misrepresent the AI provider's actual state, which
Phase 3's instructions explicitly forbid.

## Approval Center (`/approvals`)

`services/approvals/getApprovals.ts` fetches pending approvals (oldest first) and the 10
most recently decided ones, each resolved against its lead and latest `lead_scores` row
(no FK — `entity_type`/`entity_id` is polymorphic by design, so lead/score context is a
second query, same pattern as the dashboard's recent-executions widget).

Every card shows the AI's real recommendation: score, priority, confidence, intent, and
`reasoning_summary` — nothing here is re-summarized or invented.

### Approve / reject (`services/approvals/actions.ts`)

- **Reject requires a non-empty reason**, enforced twice: `rejectApprovalSchema` (Zod,
  server-side, ≤1000 chars) and, independently, the `approvals` table's own check
  constraint (`status <> 'rejected' or rejection_reason is not null`) — verified directly
  in `tests/integration/operations-center.test.ts`.
- **State transition** (`services/approvals/statusTransitions.ts`,
  `nextExecutionStatusForApprovalDecision`, pure): the execution that was `waiting_approval`
  moves to `succeeded` on approve or `failed` on reject. There is no external action to
  perform yet (see [scope](#what-this-phase-deliberately-does-not-do)), so "approved"
  already fully resolves the execution.
- **Audit events**: `approval.approved` / `approval.rejected`, with `actorId` set to the
  real reviewer and, on rejection, the reason in `metadata`.
- **Race guard**: the UPDATE always includes `.eq("status", "pending")` in addition to the
  id filter. If two reviewers submit at once, only the first UPDATE matches a row — the
  second gets zero rows back (checked via `.select().single()` returning an error), never a
  silent double-decision. Verified in the integration suite's "double-decide" test.

### Authorization: server-side, not a hidden button

`approveApprovalAction`/`rejectApprovalAction` explicitly check the caller's `profiles.role`
(`owner`/`admin` only) before touching the database — for a clear, immediate error message.
That check is **not** the actual security boundary: the pre-existing
`approvals_update_reviewer` RLS policy (Phase 1) enforces the same rule at the database
level regardless of application code, so a bug in the Server Action's role check could not
by itself allow an unauthorized approval. `tests/integration/operations-center.test.ts`
proves this directly — signed in as `member@acme-ops.dev` (a real `member`-role account,
not `owner`/`admin`), the same raw UPDATE the action would issue is attempted directly
against Postgres and returns zero updated rows.

The Approvals page hides the approve/reject buttons for non-reviewers as a UX convenience
only (`app/(app)/approvals/page.tsx`'s `canReview`) — never relied on as the actual gate.

> **Note:** `supabase/seed.sql`'s `member@acme-ops.dev` account previously ended up with
> `role = 'owner'` despite its name and despite `docs/development-setup.md` documenting it
> as `member` — `handle_new_user()` always makes a new signup the owner of its own
> (throwaway) organization, and the seed's existing trigger-disabled reassignment into Acme
> Ops only ever moved `organization_id`, never `role`. Fixed as part of this phase (now
> also sets `role = 'member'` in that same reassignment) so there's a real non-owner
> fixture to test authorization against — see `supabase/seed.sql`.

## Execution Explorer (`/executions`, `/executions/[id]`)

`/executions` (`services/executions/getExecutions.ts`) lists every execution for the
caller's org with real server-side filtering (status, `from`/`to` date range) and
pagination (`range()`, with a real Postgres `count`, not an estimate) — a plain `<form
method="get">`, so filters and page number live entirely in the URL.

### Execution timeline

`services/executions/getExecutionDetail.ts` builds the detail page's timeline from real
rows only: the execution's own `started_at`/`completed_at`, plus every `audit_logs` entry
whose `entity_type`/`entity_id` matches and whose `created_at` falls within that
execution's real time window.

**Why a time window and not a stored `executionId` link**: most audit actions
(`ai_analysis.generated`, `lead.recommendation_created`, `approval.requested`,
`approval.approved`/`rejected`) don't carry an `executionId` in their metadata — only
`lead_intelligence.failed` and `execution.retried` do. An entity (a lead) can have multiple
executions over time (each retry creates a new one), so scoping by real timestamp — between
this execution's start and completion — is the honest way to show only the events that
actually happened during _this_ run, rather than inventing a correlation the data doesn't
have. This is a deliberate, disclosed scoping decision, not a fabricated granular mockup of
steps that didn't happen.

### Retry

`services/executions/retryRules.ts` (`canRetryExecution`, pure, unit-tested) gates retry to
exactly one condition: `status === 'failed'`. `waiting_approval` and `succeeded` executions
are never retryable — there's nothing to redo, and retrying either would risk
misrepresenting the lead's true state.

`services/executions/actions.ts` (`retryExecutionAction`) is safe by construction, not by
convention:

- It **always inserts a brand-new `workflow_executions` row** — the original failed row is
  never mutated, so the original error is preserved as permanent history.
- It reuses the exact same `triggerLeadIntelligenceWorkflow` call the original pipeline
  uses, so idempotency (no duplicate `lead_scores`/`approvals`) is inherited from
  `analyzeLeadPipeline.ts`'s existing idempotency check, not reimplemented.
- It only re-triggers `lead_intelligence` — any other `workflow_name` fails immediately
  with an explicit "not implemented for this workflow" error rather than silently doing
  nothing, since no other workflow is wired up yet.
- Because the gate gives read access to a `failed` row only via RLS-scoped `workflow_executions`
  ownership, a cross-organization execution id is simply not found (verified in the
  integration suite), so retry cannot be pointed at another tenant's execution.

## Security summary

- Every new page (`/dashboard`, `/approvals`, `/executions`, `/executions/[id]`) reads
  through the RLS-respecting `createClient()` — no new service-role reads were introduced
  for anything a user's own session should already see.
- Every new Server Action re-checks authorization server-side and still relies on RLS as
  the backstop (approvals) or on RLS-scoped reads making cross-tenant rows simply
  unreachable (executions/retry) — never on hiding a button.
- No new RLS policies or migrations were needed; Phase 1's `approvals_update_reviewer` and
  the existing per-table `select own org` policies already covered every access pattern
  this phase needed.
- `tests/integration/operations-center.test.ts` exercises all of this against a real local
  Postgres instance: tenant isolation for approvals and executions, reviewer-role
  enforcement, the rejection-reason database constraint, the approve/reject race guard, and
  the resulting state transitions and audit events.

## Manual verification checklist

Performed against the local Supabase + n8n stack (`npm run db:reset`, `npm run dev`,
`docker compose up -d n8n`):

- [ ] Sign in with a seed account, land on `/dashboard`
- [ ] Dashboard shows real counts (not zero-by-placeholder) once at least one lead exists
- [ ] Creating a lead produces a new row on `/executions`
- [ ] A high-intent lead's approval appears on `/approvals`
- [ ] Approve works; the linked execution moves to `succeeded`
- [ ] Reject without a reason is blocked in the UI; reject with a reason works and moves the
      execution to `failed`
- [ ] `/executions/[id]` renders a real timeline and, for a failed execution, a retry button
- [ ] A failed execution shows its real error message, not a generic one
- [ ] Signing in as a different organization's user shows none of the first org's data
      anywhere in these pages
- [ ] No API keys or service-role values appear in any rendered page or client bundle
- [ ] Empty states (no executions/approvals yet) render sensibly, not blank/broken
- [ ] The layout is usable at a narrower (tablet-width) viewport

See the top-level PR/review notes for which of these were actually run in this environment
and their results — this file documents what the feature _is_, not a claim that every box
above has been checked in every environment.
