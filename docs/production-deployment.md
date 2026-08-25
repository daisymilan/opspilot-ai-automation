# Production Deployment (Phase 4)

How OpsPilot moves from the local dev stack (Next.js + local Supabase + local
n8n) to a real production deployment: GitHub → Vercel → Supabase Cloud →
production n8n → Claude API. Local development is unaffected by any of this —
see [Local vs. production](#local-vs-production).

## Current status

Confirmed against the real hosted project/deployment, not assumed:

- **Vercel**: deployed and reachable at
  [opspilot-ai-automation.vercel.app](https://opspilot-ai-automation.vercel.app) —
  homepage, `/login`, and `/signup` return 200; `/dashboard` correctly redirects an
  unauthenticated request to `/login` (verified directly via HTTP checks against the
  live URL).
- **Supabase Cloud**: linked, all 17 local migrations pushed and confirmed matching
  remote (`supabase migration list`) — the original 14 plus Phase 5's 3
  (`documents`, `document_extractions`, storage RLS). Schema, RLS (enabled on every
  organization-owned table, `documents`/`document_extractions` included), policies,
  functions/triggers (including the `auth.users` signup trigger), constraints, and
  indexes were all directly verified via read-only queries against the hosted
  database. The `documents` storage bucket was created directly via the Storage API
  (private, 10MB limit, pdf/png/jpeg) and confirmed with matching config.
  `supabase/seed.sql` was confirmed **not** applied — production started with zero
  rows, and stayed that way (Phase 5's own verification throwaway account/org/files
  were deleted afterward — see below).
- **n8n**: **n8n Cloud** is the actual production host — not the Railway
  recommendation below, which predates that decision. Both
  `workflows/lead-intelligence.json` and `workflows/document-intelligence.json` are
  imported, active, and their production webhooks have been exercised for real
  (document-intelligence end-to-end; lead-intelligence's webhook auth confirmed live,
  full re-run after the `$env`→literal-value fix below not yet repeated).
- **End-to-end pipeline, exercised for real, twice.** A lead created in production
  earlier reached the real Anthropic API (confirmed via `workflow_executions`/
  `audit_logs`). Separately, in this Phase 5 session: a throwaway account was created
  via the live `/signup` page, a real invoice PDF uploaded through the actual UI,
  picked up by n8n Cloud's `document-intelligence` webhook, called back into
  `/api/documents/:id/analyze`, reached the real Anthropic API with production's own
  `ANTHROPIC_API_KEY`, and produced a genuine 98%-confidence extraction (vendor,
  invoice number, $432.10/USD, due date, line item) — confirmed by reading the
  rendered detail page. The throwaway account, org, and uploaded file were deleted
  afterward via the Auth admin API and Storage API.
- **Anthropic billing — resolved, confirmed against production's own key.** An
  earlier real Claude call in production failed with a genuine `invalid_request_error`
  (insufficient account credit) at the time this was originally written. The Phase 5
  document-extraction run above used production's actual `ANTHROPIC_API_KEY` (not the
  local dev key) and succeeded for real — this limitation is resolved, not just
  locally. See the [README's Known limitations](../README.md#known-limitations).
- **Phase 5 finding, found and fixed: `$env.*` is blocked in n8n Cloud node
  expressions** (`N8N_BLOCK_ENV_ACCESS_IN_NODE`) — both workflows originally read
  `APP_BASE_URL`/`N8N_WEBHOOK_SECRET` via `$env.*` inside their `03 Analyze …` HTTP
  Request node, which fails outright on this n8n Cloud project
  (`access to env vars denied`) — contradicting the earlier "reached the real
  Anthropic API" claim, which either predates this restriction being active or wasn't
  hit by the specific check performed then. n8n's Variables feature (the natural
  `$env` replacement) turned out to be **Enterprise-gated on this trial plan**
  (confirmed live — absent from Settings entirely), so the actual fix live in
  production today is literal hardcoded values in both workflows' `03 Analyze …`
  nodes — see
  [Required n8n environment variables](#required-n8n-environment-variables). Verified
  working via the document-intelligence end-to-end run above; a lead re-run to
  confirm the same fix on that workflow has not been separately repeated in this
  session.
- **Not yet independently verified**: the production Supabase Auth settings
  described below (Site URL, redirect URLs, email-confirmation toggle) have not been
  confirmed as actually applied in the hosted project's dashboard; the
  two-organization RLS cross-tenant test in
  [Production verification procedure](#production-verification-procedure) has been
  proven locally (`tests/integration/`) but not yet re-run against the hosted
  database directly; and a full authenticated walkthrough (sign up → sign in →
  view the dashboard as a real logged-in user) has not been performed against the
  live deployment by anything in this repository — only route-level reachability has
  been checked.

## Architecture

```
                    ┌─────────────┐
  GitHub (main) ──▶ │   Vercel     │  Next.js app (Server Components,
                    │ (production) │  Server Actions, /api/leads/[id]/analyze)
                    └──────┬───────┘
                           │ anon key (RLS)      │ service role key
                           ▼                     ▼
                    ┌─────────────────────────────────┐
                    │       Supabase Cloud (hosted)     │
                    │  Postgres + RLS + Auth            │
                    │  schema = supabase/migrations/*   │
                    └─────────────────────────────────┘
                           ▲
                           │ HTTPS webhook (shared secret)
                    ┌─────────────┐
                    │ Production   │  workflows/lead-intelligence.json
                    │     n8n      │  (same workflow as local, imported once)
                    └──────┬───────┘
                           │ HTTPS
                           ▼
                    ┌─────────────┐
                    │  Anthropic   │  Claude (real API key, real billing)
                    └─────────────┘
```

Nothing about the application architecture changes for production — the same
`services/` business logic, the same RLS policies, the same n8n workflow, the
same `ClaudeProvider`. Only _where_ each piece runs changes.

## Supabase Cloud setup

> **Status: done.** See [Current status](#current-status) above — the steps below
> are kept as the reproducible procedure, not a pending task list.

The hosted project was created by the project owner as a brand-new project with no
application schema; the steps below are what was actually run to bring it to its
current, verified state.

### Link the CLI

```bash
supabase login              # interactive browser OAuth, OR:
# export SUPABASE_ACCESS_TOKEN=<personal access token>   (non-interactive, CI-friendly)

supabase link --project-ref <PROJECT_REF>
```

The project ref is the short id in the project's dashboard URL
(`supabase.com/dashboard/project/<PROJECT_REF>`) — not a secret.

### Inspect before applying anything

```bash
supabase migration list      # compare local vs. remote migration state —
                              # remote should show none applied yet
supabase db push --dry-run   # review exactly what WOULD be applied
```

### Apply migrations

```bash
supabase db push             # NOT --include-seed — see below
```

**Never use `--include-seed`.** `supabase/seed.sql` creates
`owner@acme-ops.dev` / `member@acme-ops.dev` / `owner@globex.dev` with a
publicly-known password (`DemoPass123!`, documented in
[development-setup.md](development-setup.md) precisely because it's
dev-only) — pushing it to production would put real, working credentials
into a live database. Production demo data instead comes from
[`scripts/seed-demo-data.mjs`](#demo-data), a separate, explicit mechanism.

**Never**: `supabase db pull` (nothing to pull from a schema-less remote —
migrations are the source of truth in this project, not the reverse),
`supabase db reset --linked` (destructive; reserved for local only), manual
table/RLS edits via the dashboard SQL editor (schema drift the migrations
history can't see or reproduce).

### Verify

```bash
supabase migration list      # every local migration should now show as applied remotely
```

Then, using the **anon key** (not service role) against the hosted project —
the same authenticated-user path the app itself uses, not an RLS-bypassing
check — confirm:

- `organizations`, `profiles`, `leads`, `lead_scores`, `approvals`,
  `workflow_executions`, `audit_logs` all exist with RLS enabled
  (`select relrowsecurity from pg_class where relname = '<table>'`, or the
  dashboard's Table Editor, which shows an RLS badge per table).
- Signing up a throwaway test user (via the real `/signup` page against the
  deployed app, or `supabase.auth.admin.createUser` for a CLI-only check)
  produces a `profiles` row and an `organizations` row in the same
  transaction — i.e. `handle_new_user()` fired correctly. Delete the
  throwaway user afterward (`supabase.auth.admin.deleteUser`).
- A second test user in a second organization cannot see the first's leads —
  the same tenant-isolation property `tests/integration/tenant-isolation.test.ts`
  proves locally, now proven against the real hosted database.

## Production Supabase Auth configuration

Local `supabase/config.toml` has `auth.email.enable_confirmations = false`
and `site_url = "http://127.0.0.1:3000"` — neither is appropriate for
production as-is.

1. **Site URL**: set to the real production URL (the Vercel production
   domain, e.g. `https://opspilot.vercel.app`, or a custom domain) in the
   hosted project's Authentication → URL Configuration. This is what
   Supabase uses to build links in any auth email it sends.
2. **Redirect URLs**: add the production URL (and any preview-deployment
   pattern you want to allow, e.g. `https://opspilot-*.vercel.app` if using
   Vercel preview deployments) to the allow-list. The app doesn't currently
   use OAuth/magic-link redirects, but Supabase still validates against this
   list for any auth flow that redirects.
3. **Email confirmations**: `services/auth/actions.ts`'s `signUp()` assumes
   an active session is returned immediately and redirects straight to
   `/dashboard`. Supabase Cloud projects default to email confirmations
   **on**, which would break that assumption (no session until the email is
   confirmed). Recommended: disable email confirmation in the hosted
   project's Auth settings to match current, tested app behavior — this is a
   one-time dashboard toggle, not a code change. (Building a "check your
   email" UI is a real feature addition and out of scope for this phase.)
4. **Password reset**: not implemented anywhere in the app (no route, no
   Server Action) — nothing to configure. Documented here as a known gap,
   not silently omitted.

None of this weakens RLS or authentication — it only points the existing
flows at the right URL and preserves today's tested signup behavior.

## Production n8n

> **Status: done — n8n Cloud is the actual production host.** The
> recommendation and alternatives below reflect the reasoning at the time this
> section was written, before that decision was made; n8n Cloud, not Railway, is
> what was ultimately deployed and is currently live. Kept here for the reasoning,
> not as an open decision.

Vercel cannot host n8n — it's a long-running, stateful service (holds
encrypted credentials on disk), not a serverless function. It needs its own
host, reachable over HTTPS by both the Vercel app (to trigger the workflow)
and the app's callback route (`/api/leads/[id]/analyze`, which n8n calls).

**Recommendation: Railway**, deploying the same `n8nio/n8n:1.72.1` image
already pinned in `docker-compose.yml`, with a persistent volume for
`/home/node/.n8n`. Reasoning:

- Deploys an arbitrary Docker image directly — no Dockerfile rewrite, no new
  build pipeline; it's the exact same image/version already tested locally.
- Persistent volumes are first-class (required — n8n's credential store and
  workflow data live on disk at `/home/node/.n8n`; without persistence,
  every redeploy would lose the imported workflow and Header Auth
  credential).
- Automatic HTTPS on a generated subdomain (or a custom domain), satisfying
  the "reachable by Vercel over HTTPS" requirement with no separate
  reverse-proxy/TLS setup.
- Low operational burden appropriate for a portfolio deployment — no server
  patching, no manual certificate renewal.

**Alternatives, if preferred:**

- **Fly.io** — equivalent fit (native volumes, Docker-native, a genuine free
  allowance), slightly more CLI-config (`fly.toml`) than Railway's
  point-and-deploy.
- **A small VPS + `docker-compose.yml` as-is + Caddy/Traefik for TLS** — the
  most control and the closest literal match to the existing file, but adds
  real ongoing ops burden (OS patching, certificate renewal, backups) for
  a project this size.
- **n8n Cloud** (n8n's own hosted offering) — zero infra to manage, but a
  separate product/subscription from self-hosting, and doesn't reuse the
  pinned Docker image/version already validated locally.

This decision has been made (n8n Cloud) and is live — see
[Current status](#current-status).

### Required n8n environment variables

Set on the n8n host itself (never in Vercel, never in Git):

| Variable                   | Purpose                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `N8N_ENCRYPTION_KEY`       | n8n's own credential-store encryption key. Generate independently from the local-dev value — losing/rotating it after workflows are saved makes n8n unable to decrypt stored credentials. |
| `N8N_PROTOCOL=https`       | So n8n constructs its own webhook URLs as `https://…`.                                                                                                                                    |
| `N8N_HOST` / `WEBHOOK_URL` | The n8n host's own public HTTPS URL, so generated webhook URLs are correct behind the platform's proxy.                                                                                   |
| `GENERIC_TIMEZONE`         | Matches local (`UTC`) for consistent timestamps.                                                                                                                                          |

`N8N_WEBHOOK_SECRET` is used in **two** places inside n8n, and neither is a
container/process environment variable read via `$env`:

1. **Inbound** (app → n8n): the value of the `OpsPilot Webhook Secret`
   Header Auth **credential**, entered once through the n8n editor UI after
   import.
2. **Outbound** (n8n → app): each workflow's `03 Analyze …` HTTP Request
   node sends it as the `X-Webhook-Secret` header. **Not** `$env.*`: n8n
   Cloud blocks `$env` access inside node expressions by default
   (`N8N_BLOCK_ENV_ACCESS_IN_NODE`), which is exactly what surfaced this —
   found live during Phase 5's production verification, when
   `workflows/document-intelligence.json`'s original `$env.APP_BASE_URL`
   failed with `access to env vars denied`, and turned out to affect
   `workflows/lead-intelligence.json` identically.

   The committed workflow JSON uses n8n's **Variables** feature
   (`$vars.APP_BASE_URL`/`$vars.N8N_WEBHOOK_SECRET`, Settings → Variables) as
   the portable fix — works the same way on Cloud and self-hosted, no secret
   in Git either way. **But on this project's actual n8n Cloud plan
   (trial), Variables is itself Enterprise-gated** — confirmed live: it's
   not in the trial's Settings sidebar at all, only "Environments" (a
   different, also-gated feature) is. So **what production actually runs**
   is literal hardcoded values pasted directly into each workflow's `03
   Analyze …` node (URL field's base and the header's value), entered
   manually after import — exactly like the credential value already is,
   never committed to the workflow JSON. If/when this project's n8n plan
   changes to one with Variables, switching back to `$vars.*` (matching the
   committed JSON) is a drop-in change, not a rewrite.

Both the credential and the URL/secret values (Variables, or literal
node values on a Variables-less plan) are entered once through the n8n
editor UI after import (exactly as documented for local setup in
[lead-intelligence.md](lead-intelligence.md#local-setup)), using
production-specific values independently generated from local dev.

### Persistence

The `/home/node/.n8n` volume must survive redeploys — that's where the
imported workflow, its `active` state, and the Header Auth credential live.
Losing it means re-importing `workflows/lead-intelligence.json` and
re-entering the credential from scratch.

### Webhook URL

Production: `https://<n8n-host>/webhook/lead-intelligence` — the app's
`N8N_BASE_URL` (Vercel env var) points at the n8n host's base URL;
`N8N_LEAD_WEBHOOK_PATH` stays `/webhook/lead-intelligence` (unchanged from
local, it's a workflow path, not an environment-specific value).

### Security

- The workflow JSON in Git (`workflows/lead-intelligence.json`) contains
  **no secrets** — the Header Auth credential is referenced by name/id only
  (`"OpsPilot Webhook Secret"`), never its value. This was already true
  before Phase 4; re-verified here (`grep`-scanned for secret-shaped
  strings — none found).
- Production must use **independently generated** values for
  `N8N_WEBHOOK_SECRET` and `N8N_ENCRYPTION_KEY` — never the local-dev ones.
- The n8n editor itself (`https://<n8n-host>/`) should be protected — at
  minimum n8n's own owner-account login (already required by n8n itself on
  first launch), and ideally the hosting platform's own access controls if
  the editor doesn't need to be public at all.
- The webhook remains authenticated in both directions by the shared secret
  (`crypto.timingSafeEqual` on the app side, Header Auth credential on the
  n8n side) — this is existing Phase 2 behavior, re-verified unchanged
  during this phase's code review, not something Phase 4 needed to add.

## Vercel deployment

> **Status: done.** Live at
> [opspilot-ai-automation.vercel.app](https://opspilot-ai-automation.vercel.app) —
> see [Current status](#current-status). The steps below are the reproducible
> setup procedure, not a pending task list.

The project is Vercel-compatible with no framework-specific changes needed:

- `next.config.ts`'s `output: "standalone"` (added for the Dockerfile build)
  doesn't interfere with Vercel — Vercel uses its own build output
  regardless.
- Server Actions, the `/api/leads/[id]/analyze` Route Handler, and
  `proxy.ts` (Next.js's post-v16 middleware convention) all run as
  Vercel Functions with no code changes.
- `@supabase/ssr` cookie handling is framework-standard and works
  identically on Vercel.

### Setup

1. Import the GitHub repository into Vercel (github.com login, not
   something I can do without your account).
2. Framework preset: Next.js (auto-detected).
3. Set the environment variables below, scoped to **Production** (see
   [Environment variables](#environment-variables)).
4. Deploy. `main` → Production; PRs get preview deployments automatically
   (Vercel's default) — no extra config needed for that.

GitHub remains the source of truth; Vercel deploys are triggered by pushes,
never the reverse.

## Environment variables

Full inventory, built from actual `process.env.*` usage in the codebase
(verified by repo-wide search, not assumed) — see `.env.example` for the
same list with inline explanations.

### Public (Vercel: safe in any environment, incl. Preview)

| Variable                        | Set to                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | The production URL (used only for Open Graph/metadata)                  |
| `NEXT_PUBLIC_SUPABASE_URL`      | The hosted Supabase project's API URL                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The hosted project's anon key (RLS-scoped by design — safe client-side) |

### Server-only secrets (Vercel: Production environment, "Sensitive" if offered)

| Variable                    | Set to                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | The hosted project's service role key. **Never** in a client component, **never** logged. |
| `ANTHROPIC_API_KEY`         | A real Anthropic key with active billing                                                  |
| `ANTHROPIC_MODEL`           | Optional; defaults to `claude-sonnet-5` in code if unset                                  |
| `AI_CONFIDENCE_THRESHOLD`   | Optional; defaults to `0.7` in code if unset                                              |
| `N8N_BASE_URL`              | The production n8n host's base URL                                                        |
| `N8N_LEAD_WEBHOOK_PATH`     | Optional; defaults to `/webhook/lead-intelligence` in code if unset                       |
| `N8N_WEBHOOK_SECRET`        | A production-specific value, independently generated from local dev                       |

### Not set in Vercel at all (n8n host's own environment)

`N8N_ENCRYPTION_KEY`, `APP_BASE_URL` (n8n's copy, pointing at the production
app URL) — read by the n8n process itself, never by the Next.js app. See
[Production n8n](#production-n8n).

None of these are invented — every name above was found by grepping actual
`process.env.*` reads in `services/`, `lib/`, and `app/`, cross-checked
against `.env.example` and `docker-compose.yml`.

## Production API / webhook security (reviewed, not changed)

`app/api/leads/[id]/analyze/route.ts` and the surrounding proxy already
satisfy this phase's requirements, re-verified by reading the current code
rather than assumed from memory:

- Fails closed (500) if `N8N_WEBHOOK_SECRET` isn't configured server-side —
  an unconfigured secret is never treated as "no auth required."
- Constant-time comparison (`crypto.timingSafeEqual`) against the provided
  header, avoiding a timing side-channel.
- `organization_id` for the pipeline is derived from the fetched `leads`
  row, never trusted from the request payload.
- Request body is Zod-validated (`executionId` must be a UUID) before any
  DB/AI work happens.
- **API routes never receive an HTML login redirect.**
  `lib/auth/route-guard.ts`'s `isApiRoute()` check exists specifically so
  `/api/*` always gets `"allow"` from the middleware and returns its own
  JSON response — this was a real bug found and fixed during Phase 2 (an
  unauthenticated API call was silently being redirected to a 200 HTML
  login page instead of a 401), re-confirmed still correct on Phase 4
  review.
- Errors returned to callers are the deliberately-written messages from
  `AIConfigurationError`/`AIProviderError`/`AIOutputValidationError`/
  `N8nConfigurationError`/`N8nWebhookError` — none of them interpolate raw
  API keys, headers, or stack traces.

No code changes were needed here; this section documents the review, per
Phase 4 Step 7.

## Production error handling (reviewed, not changed)

| Failure                                        | Behavior                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI provider misconfigured/fails/invalid output | Execution `failed`, real error message (no secrets), audit event `lead_intelligence.failed` (added in Phase 3)                                   |
| n8n unreachable/misconfigured                  | `N8nWebhookError` with the unreachable URL (not a secret) in the message; lead row itself is preserved                                           |
| Database failure                               | Supabase's own `error.message` surfaced onto the execution record, never swallowed                                                               |
| Duplicate/idempotent webhook                   | Existing `lead_scores` row is reused, no second AI call, no duplicate approval — see `services/leads/analyzeLeadPipeline.ts`'s idempotency check |
| Approval failure (race, missing reason)        | Rejected at both the Zod layer and the database's own check constraint — see `docs/operations-center.md`                                         |

Every failure path above preserves the execution/audit record rather than
discarding it — this was Phase 2/3 behavior, confirmed still true, not new
work for Phase 4.

## Rate limiting / abuse (decision: not adding a new system)

Reviewed every publicly-reachable surface:

- **Signup/login** — Supabase Auth has its own built-in per-IP rate limits
  (`auth.rate_limit.sign_in_sign_ups`, etc. — visible in
  `supabase/config.toml` locally; the hosted project has the equivalent
  configurable in its dashboard). This is the platform's job, not
  application code's.
- **Lead creation** — requires an authenticated, RLS-scoped session
  (`createLeadAction` reads the caller's session before writing); not a
  public/anonymous surface an outsider can hit.
- **The n8n webhook callback** (`/api/leads/[id]/analyze`) — rejects with
  401 before touching the database or calling Claude if the shared secret
  doesn't match. An attacker without the secret cannot cause any real cost;
  an attacker _with_ the secret is n8n itself, a trusted caller.

Given none of these are unprotected, cost-bearing, unauthenticated surfaces,
adding a bespoke rate-limiting layer (e.g. a Vercel KV-backed limiter) now
would be complexity without a corresponding real risk — exactly what this
phase's instructions say to avoid. If usage patterns change (e.g. the app
becomes genuinely public-facing at scale), a Vercel KV/Upstash-based
sliding-window limiter on `/api/leads/[id]/analyze` is the natural next
step — not built now.

## Production health checks (reviewed, not changed)

`services/dashboard/getSystemHealth.ts` and
`services/dashboard/aiProviderHealth.ts` (built in Phase 3) already satisfy
this phase's requirements exactly:

- **Database**: a real trivial `select` — `healthy` or `error`, never
  assumed.
- **n8n**: a real `fetch` to `${N8N_BASE_URL}/healthz` with a 3s timeout —
  `healthy`/`unreachable`/`not_configured`, never assumed.
- **AI provider**: derived from (a) whether `ANTHROPIC_API_KEY` is set and
  (b) the most recent `lead_intelligence` execution's real outcome —
  `not_configured` / `configured_unverified` / `configured` /
  `authentication_failure` / `billing_failure` / `unavailable` /
  `unknown_error`. **Never** `configured`/"healthy" merely because a key
  exists — confirmed by re-reading `deriveAiProviderHealth` and its unit
  tests (`tests/unit/ai-provider-health.test.ts`), including the test built
  from this project's own real captured Anthropic billing-failure message.

No changes were needed for production — these were already honest,
non-fabricated checks when built in Phase 3, and remain correct against a
hosted Supabase project and a production n8n host (same fetch/query logic,
different URLs).

## Demo data

Production starts with **zero rows** — `supabase/seed.sql` is never applied
to the hosted project (`db push` without `--include-seed`).

For a public portfolio demo, `scripts/seed-demo-data.mjs` creates one
clearly-labeled organization ("OpsPilot Demo (Portfolio Preview)") with:

- One demo login (random password, printed once to your terminal, never
  written to Git/docs — share it privately, don't publish it).
- Three synthetic leads with obviously fake names/companies (e.g. "Demo
  Lead — Example Robotics Co").
- Real rows (not fabricated dashboard numbers) for `workflow_executions`,
  `lead_scores`, and one `approvals`/`audit_logs` pair — inserted directly
  rather than run through the live Claude API, so the demo doesn't depend
  on AI cost/latency or risk a real billing failure appearing on the public
  demo. Each synthetic `lead_scores` row is labeled `model: "demo-fixture"`
  so it's never mistaken for a real AI response if inspected directly.

Run once against the hosted project:

```bash
SUPABASE_URL=<hosted URL> SUPABASE_SERVICE_ROLE_KEY=<hosted service role key> \
  npm run demo:seed
```

This is intentionally separate from `supabase/seed.sql` (which stays
dev/test-only, per this phase's constraints) and is never run automatically
by any deploy step.

## Production verification procedure

> **Status: not yet done against the hosted database.** This exact test is proven
> locally (`tests/integration/tenant-isolation.test.ts`,
> `tests/integration/operations-center.test.ts`) but has not yet been re-run
> against the hosted Supabase project directly — see
> [Current status](#current-status). Anthropic API success in production
> specifically remains unverified and unresolved (billing) — do not treat it as done.

After deployment, verify against the **real hosted Supabase project**,
through the **authenticated/anon-key path** — never the service role key,
since the point is to prove RLS itself, not to bypass it:

1. Create two throwaway users in two different organizations (via `/signup`
   against the live deployment, or `auth.admin.createUser`).
2. As user A: confirm they see only their own leads/executions/approvals/
   audit logs.
3. As user A: confirm a direct-id lookup of user B's lead/execution/approval
   returns nothing (empty result or 404, matching the pattern already
   proven locally in `tests/integration/tenant-isolation.test.ts` and
   `tests/integration/operations-center.test.ts`).
4. As user A: confirm they cannot approve/reject user B's approval.
5. Delete both throwaway users afterward.

Combined with the manual walkthrough in Phase 4's Step 13 (homepage, login,
signup, dashboard, leads, approvals, executions, logout, protected routes,
API auth, the real n8n webhook, and — if Anthropic credits are still
unavailable — confirming the pipeline reaches a real, honest `billing_failure`
rather than any fabricated success).

## Rollback considerations

- **App**: Vercel keeps prior deployments; rolling back is re-promoting a
  previous deployment in the Vercel dashboard — no database action implied.
- **Database**: this project's migrations are additive-only so far (no
  destructive migration has been written); rolling back a bad migration
  means writing and applying a new corrective migration, not editing or
  deleting a past one (this project's stated policy is to never edit
  existing migrations).
- **n8n**: the persistent volume holds workflow state independently of the
  app deployment — rolling back the app doesn't affect n8n, and vice versa.

## Local vs. production

|           | Local                                     | Production                                                |
| --------- | ----------------------------------------- | --------------------------------------------------------- |
| App       | `npm run dev`                             | Vercel                                                    |
| Database  | Local Supabase (Docker, `supabase start`) | Supabase Cloud                                            |
| n8n       | `docker compose up -d n8n`                | Hosted n8n (see above)                                    |
| Seed data | `supabase/seed.sql` via `db:reset`        | Never — `scripts/seed-demo-data.mjs` only, run manually   |
| Secrets   | `.env.local` (gitignored)                 | Vercel env vars + n8n host's own env + Supabase dashboard |

Local development is unaffected by any Phase 4 change: `npm run db:start`,
`npm run db:reset`, and `npm run test:integration` all continue to run
against local Supabase exactly as before. `.env.local` must never be pointed
at the hosted project for day-to-day development — if you ever need to run
something locally against the hosted database intentionally, do it as a
one-off with explicit env vars on the command line (as
`scripts/seed-demo-data.mjs` requires), not by editing `.env.local`.
