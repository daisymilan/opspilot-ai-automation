# AI Document Intelligence

Phase 5's vertical slice: an uploaded invoice (PDF/PNG/JPEG) is stored, handed to n8n,
extracted by Claude with strictly-validated structured output, scored against business
rules, and — when the extracted amount is large or the AI wasn't confident — routed to
the same human approval queue Lead Intelligence uses. Same engine as
[Lead Intelligence](lead-intelligence.md), a second vertical: `workflow_executions`,
`approvals`, `audit_logs`, the Approval Center, and the Execution Explorer are reused
unchanged (generalized to resolve document context alongside lead context — see
[Reusing the Operations Center](#reusing-the-operations-center) below), not duplicated.

## Deliberate simplification vs. the original architecture sketch

[docs/architecture.md](architecture.md#the-four-core-workflows) originally sketched
`Upload → Storage → Text Extraction → AI Analysis` for Document Intelligence. The
separate text-extraction step was dropped: Claude reads PDFs and images natively via
document/image content blocks, so a dedicated OCR stage would be a moving part with no
job to do — one fewer external dependency, one fewer failure mode, same result.

## End-to-end flow

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant A as Next.js Server Action
    participant S as Supabase Storage
    participant DB as Supabase Postgres
    participant N as n8n
    participant R as /api/documents/:id/analyze
    participant C as Claude

    U->>A: Submit "Upload invoice" form
    A->>A: sniff magic bytes (never trust the client's claimed MIME type)
    A->>S: upload file to the private `documents` bucket (org-scoped path)
    A->>DB: insert documents (RLS, user session)
    A->>DB: insert workflow_executions (status=running, service role)
    A->>DB: insert audit_logs "document.uploaded" (service role)
    A->>N: POST /webhook/document-intelligence (X-Webhook-Secret)
    N->>N: validate payload shape
    N->>R: POST /api/documents/:id/analyze (X-Webhook-Secret, executionId)
    R->>DB: fetch document (service role; org derived from the row, never trusted from payload)
    R->>DB: check for an existing document_extractions row (idempotency)
    R->>S: download the file
    R->>C: analyze document (forced structured tool output, document/image content block)
    C-->>R: structured extraction
    R->>R: Zod-validate output
    R->>R: apply business rules (confidence threshold, amount threshold)
    R->>DB: insert document_extractions (service role)
    R->>DB: insert approvals if required (service role)
    R->>DB: update workflow_executions (succeeded / waiting_approval / failed)
    R->>DB: insert audit_logs (ai_extraction.generated, document.recommendation_created, approval.requested)
    R-->>N: {success, documentExtractionId, requiresApproval}
    N-->>A: forwards the same response
    A-->>U: redirect to /documents/:id
    U->>DB: page reads document + document_extractions + workflow_executions + approvals (RLS)
```

## Responsibility boundary: n8n vs. the application

Same shape as Lead Intelligence — n8n orchestrates only, the entire pipeline runs in one
place: `services/documents/analyzeDocumentPipeline.ts`, invoked by
`app/api/documents/[id]/analyze`. `workflows/document-intelligence.json` has the same
five-node shape as `workflows/lead-intelligence.json`, reusing the same
`OpsPilot Webhook Secret` Header Auth credential (same n8n instance, same trust
boundary — no reason to provision a second secret).

| Node                          | Type                  | Does                                                              |
| ------------------------------ | --------------------- | ------------------------------------------------------------------ |
| `01 Receive Document`          | Webhook (Header Auth) | Entry point, authenticated                                        |
| `02 Validate Input`            | If                    | Payload shape only (`documentId`/`executionId` present)            |
| `03 Analyze Document`          | HTTP Request          | Calls the app; this is where all business logic actually runs     |
| `04 Respond With Result`       | Respond to Webhook    | Forwards the app's response verbatim                              |
| `05 Respond Invalid Request`   | Respond to Webhook    | 400 for malformed payloads                                        |

## AI architecture

- **Provider abstraction** (`services/ai/types.ts`): `AIProvider` now has
  `analyzeDocument(input): Promise<DocumentExtraction>` alongside `analyzeLead`. `model`
  stays a single shared field (it's the same underlying Claude model either way), but
  `promptVersion` is split into `leadAnalysisPromptVersion`/
  `documentExtractionPromptVersion` — one provider, two independently-versioned prompts.
- **`ClaudeProvider.analyzeDocument`** (`services/ai/providers/claudeProvider.ts`): forced
  tool-use, same as `analyzeLead`, but the user message includes a `document` (PDF) or
  `image` (PNG/JPEG) content block with base64 file data instead of plain text.
- **`DeterministicTestProvider.analyzeDocument`**: decodes the uploaded bytes as UTF-8 and
  keyword-matches (`high_amount`, `low_confidence`, `no_vendor`) — the same
  text-fixture convention `analyzeLead` uses for message/company text, since there's no
  real file to OCR in a test.
- **Prompt versioning** (`services/ai/prompts/documentExtraction.ts`):
  `DOCUMENT_EXTRACTION_PROMPT_VERSION`, stored on every `document_extractions` row
  alongside `model`.

### Structured output validation

`services/documents/schema.ts` (`documentExtractionSchema`, Zod) is the actual
enforcement:

| Field                     | Constraint                                    |
| -------------------------- | ---------------------------------------------- |
| `vendor_name`               | ≤200 chars, nullable (never guessed)            |
| `invoice_number`            | ≤100 chars, nullable                            |
| `amount`                    | number ≥0, nullable                             |
| `currency`                  | exactly 3 chars (ISO 4217), nullable            |
| `due_date`                  | ISO 8601 date, nullable                         |
| `line_items`                | ≤50 items, each with a non-empty description    |
| `confidence`                | number, 0–1                                     |

If Claude's tool call doesn't parse against this schema, the pipeline fails the execution
loudly (`AIOutputValidationError`) — same as Lead Intelligence, never a partial/default
result.

**Prompt injection**: the document's own content is untrusted input (it's a file a user
uploaded). The system prompt explicitly instructs Claude to treat it as data, not
instructions.

## Business rules

`services/documents/businessRules.ts` — pure, synchronous, fully unit-tested:

- **Confidence below `AI_CONFIDENCE_THRESHOLD`** (default `0.7`, same env var Lead
  Intelligence uses) → approval required.
- **Extracted `amount` above `DOCUMENT_APPROVAL_AMOUNT_THRESHOLD`** (default `1000`) →
  approval required regardless of confidence — dollar exposure is this vertical's version
  of leads' always-review-these-actions list.

Both reasons can fire together; `decideDocumentAction`'s `reason` reports all that apply.

## Human approval

Uses the existing `approvals` table unmodified (`entity_type='document'`,
`action_type='review_extraction'`). `services/approvals/getApprovals.ts` and
`components/approvals/ApprovalCard.tsx` were generalized in this phase to resolve and
render document/extraction context (vendor, amount, confidence) alongside lead context —
see [Reusing the Operations Center](#reusing-the-operations-center).

## Execution tracking

Same shape as Lead Intelligence: one `workflow_executions` row per run
(`workflow_name='document_intelligence'`), terminal states `succeeded` /
`waiting_approval` / `failed`. `documents.status` additionally tracks
`uploaded → analyzing → extracted`/`failed` for the document's own lifecycle (distinct
from the execution's — a document can be re-analyzed with a new execution while its own
`status` reflects only the latest run).

## Audit logging

Events recorded: `document.uploaded`, `ai_extraction.generated`,
`document.recommendation_created`, `approval.requested` (when applicable), and
`document_intelligence.failed` on any failure — same `recordAuditEvent` helper, same
service-role-write-only, append-only `audit_logs` table.

## Error handling

| Failure                                          | Where                                     | Behavior                                                                                                    |
| -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Unsupported file type / oversized upload           | `services/documents/uploadSchema.ts` + magic-byte sniffing | Rejected before any storage write, regardless of the client's claimed MIME type |
| Storage upload succeeds, row insert fails          | `services/documents/uploadDocument.ts`     | The now-orphaned storage object is removed — never a file with no owning row                                  |
| Duplicate **analysis** (retried webhook)           | `analyzeDocumentPipeline.ts`               | Idempotent — returns the existing `document_extractions` row and the document's real current state, no second AI call |
| AI API failure / timeout                           | `ClaudeProvider` (30s timeout)              | `AIProviderError` → execution `failed`, `documents.status` → `failed`                                          |
| Invalid AI response                                | `ClaudeProvider` (Zod)                      | `AIOutputValidationError` → execution `failed`                                                                 |
| Corrupted/unreadable file                          | Claude's own document/image parsing         | Surfaces as an `AIProviderError` or `AIOutputValidationError`, handled the same as any other AI failure         |
| n8n unreachable/misconfigured                      | `services/documents/triggerDocumentWorkflow.ts` | Document still uploaded; execution `failed` with a clear reason — **verified live**, see below                |
| n8n reachable, workflow not imported/active        | `services/documents/triggerDocumentWorkflow.ts` | n8n's real 404 ("webhook not registered") is surfaced verbatim on the execution record, not swallowed          |

## Security

- **Tenant isolation**: `document_extractions` has the same RLS shape as `lead_scores` —
  `authenticated` gets `SELECT` only, scoped to `current_org_id()`; all writes are
  service-role only.
- **Storage RLS**: the `documents` bucket is private; policies scope `select`/`insert` to
  the caller's own `current_org_id()` as the object path's first segment
  (`{organization_id}/{document_id}/{filename}`) — verified in
  `tests/integration/tenant-isolation.test.ts`.
- **File type/size enforcement, twice**: the bucket's own `allowed_mime_types`/
  `file_size_limit` (belt) and server-side magic-byte sniffing before upload (suspenders)
  — the client's claimed `File.type` is never trusted on its own.
- **Signed URLs, not a public bucket**: the UI never links to a public bucket URL; nothing
  in this phase serves a raw file URL to the browser.
- **Webhook authentication**, same shared secret and trust boundary as Lead Intelligence —
  see [lead-intelligence.md#security](lead-intelligence.md#security).
- **Organization boundary**: the analyze endpoint derives `organization_id` from the
  fetched `documents` row, never from the webhook payload.

## Reusing the Operations Center

Built in Phase 3 for leads only; this phase found and fixed three places where "generic
over `entity_type`" wasn't actually true yet:

- `services/approvals/getApprovals.ts` only ever resolved lead/`lead_scores` context — a
  document approval would have rendered as "Unknown lead" with no extraction data.
  Generalized to resolve lead-or-document context by `entity_type`.
- `services/executions/leadNames.ts` (now `entityNames.ts`,
  `resolveLeadNames`→`resolveEntityNames`) only resolved lead names for the dashboard's
  recent-executions widget and the executions list — a document execution showed its raw
  UUID. Generalized to resolve a lead name or a document's `file_name`.
- `services/approvals/actions.ts`'s `revalidateApprovalPages` hardcoded
  `/leads/${entityId}` — a decided document approval's own detail page wouldn't
  revalidate. Now branches on `entity_type`.
- `services/executions/actions.ts`'s retry action only ever re-triggered
  `lead_intelligence` — a failed document execution's retry button would create a new
  execution row and immediately fail it. Now branches on `workflow_name` to call the
  matching trigger function.

With those four fixes, the rest of the Operations Center genuinely required zero
changes: `ExecutionTimeline`, `RecentExecutionsTable`'s rendering, and
`getExecutionDetail`'s audit-event time-window logic all already worked correctly for any
`entity_type` — they just needed a document/extraction section added alongside the
existing lead/score one.

## Local setup

### 1. AI

Same `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` as Lead Intelligence. New optional var:

```
DOCUMENT_APPROVAL_AMOUNT_THRESHOLD=1000
```

### 2. n8n

Same running n8n instance as Lead Intelligence (`docker compose up -d n8n`). Additional
one-time setup:

1. **Workflows → Import from File** → `workflows/document-intelligence.json`.
2. Open the imported workflow, attach the existing `OpsPilot Webhook Secret` credential
   to the `01 Receive Document` node (reused, not re-created).
3. The `APP_BASE_URL`/`N8N_WEBHOOK_SECRET` values (n8n Variables, or literal
   hardcoded node values on a trial plan without Variables — see
   [lead-intelligence.md#local-setup](lead-intelligence.md#local-setup)) are reused
   as-is from Lead Intelligence's setup — same values, same n8n instance, nothing new
   to configure here beyond repeating the same edit on this workflow's `03 Analyze
   Document` node.
4. Activate the workflow.

New env var, read by this app (not n8n): `N8N_DOCUMENT_WEBHOOK_PATH` is not required
(defaults to `/webhook/document-intelligence` in code) unless you changed the imported
workflow's webhook path.

### 3. Verify

```bash
npm run db:reset        # applies the Phase 5 migrations
npm run dev              # in one terminal
docker compose up -d n8n # in another
```

Sign in, go to **Documents**, upload a PDF/PNG/JPEG invoice — with a real
`ANTHROPIC_API_KEY` configured and the workflow imported/active in n8n, you should see a
real Claude-generated extraction on the document's detail page within a few seconds.

> **What was actually verified in this session, and how.** The full pipeline
> (`services/documents/analyzeDocumentPipeline.ts`) was first run directly against the
> real Claude API with a real, hand-built single-page invoice PDF — not the deterministic
> test provider — and correctly extracted vendor name, invoice number, a $432.10 amount,
> USD currency, a due date, and one line item at 0.98 confidence. Locally, the upload
> form, list, and detail pages were driven live in a real headless browser (Playwright),
> including a document approval's full context (vendor, amount, confidence) rendering
> correctly in the Approval Center and Approve correctly transitioning its status.
>
> Then the **entire pipeline was verified for real in production**: a throwaway account
> was created via the live `/signup` page, a real invoice PDF uploaded through the actual
> UI, picked up by n8n Cloud's `document-intelligence` webhook, called back into
> `/api/documents/:id/analyze` in production, reached the real Anthropic API with
> production's own `ANTHROPIC_API_KEY`, and produced a genuine 98%-confidence extraction
> (vendor, invoice number, $432.10/USD, due date, line item) — confirmed by reading the
> rendered detail page, not taken on faith. This also confirms the Anthropic billing
> issue documented in [production-deployment.md](production-deployment.md) is resolved
> against production's own key, not just the local dev key. The throwaway account, its
> org, and its uploaded file were deleted afterward (auth user + orphaned org + storage
> object — the org isn't cascade-deleted by the auth user's own deletion, since
> `organizations` has no FK to `auth.users`).
>
> Getting there surfaced two real, now-fixed production issues, neither of which was
> specific to documents — both affected the pre-existing `lead-intelligence` workflow
> identically, just never hit until this session's live testing:
> 1. n8n Cloud blocks `$env.*` access inside node expressions by default
>    (`N8N_BLOCK_ENV_ACCESS_IN_NODE`) — both workflows originally read
>    `APP_BASE_URL`/`N8N_WEBHOOK_SECRET` that way.
> 2. n8n's Variables feature (the natural replacement) turned out to be Enterprise-gated
>    on this trial account (confirmed live — not present in Settings at all), so the
>    actual production fix is literal hardcoded values in the two `03 Analyze …` nodes,
>    entered manually the same way the Header Auth credential's value already is — see
>    [production-deployment.md](production-deployment.md#required-n8n-environment-variables).
