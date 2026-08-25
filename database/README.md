# database/

This folder is documentation only. The schema itself — the source of truth —
lives under [`supabase/migrations/`](../supabase/migrations/), because the
Supabase CLI (`supabase start`, `supabase db reset`, `supabase db push`)
requires that fixed location to provide real "reproduce the database from
scratch" tooling. See [docs/architecture.md](../docs/architecture.md#database-architecture)
for why `supabase/` rather than `database/` owns the SQL.

## Entities

| Table                 | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `organizations`       | Tenant root. Every other org-owned table hangs off this.                        |
| `profiles`            | Extends `auth.users` with organization membership + role.                       |
| `leads`               | Lead record, including the optional `message` the AI analysis reads (Phase 2).  |
| `workflow_executions` | Observability record for automation runs. Written by the service role only.     |
| `approvals`           | Human-in-the-loop queue gating sensitive AI-recommended actions.                |
| `lead_scores`         | AI-generated lead analysis history (Phase 2). Written by the service role only. |
| `audit_logs`          | Append-only audit trail. No role has update/delete on this table.               |
| `documents`           | Uploaded document metadata (Phase 5). File bytes live in the `documents` storage bucket. |
| `document_extractions`| AI-generated document extraction history (Phase 5). Written by the service role only. |

## Relationships

```
organizations 1──* profiles (organization_id)
organizations 1──* leads (organization_id)
organizations 1──* workflow_executions (organization_id)
organizations 1──* approvals (organization_id)
organizations 1──* audit_logs (organization_id)
organizations 1──* documents (organization_id)

auth.users 1──1 profiles (id = auth.users.id)
profiles 1──* leads (owner_id, nullable)
profiles 1──* approvals (requested_by / reviewed_by, nullable)
profiles 1──* audit_logs (actor_id, nullable)
profiles 1──* documents (uploaded_by, nullable)
leads 1──* lead_scores (lead_id) — one row per analysis run, not overwritten on re-analysis
documents 1──* document_extractions (document_id) — one row per analysis run, not overwritten on re-analysis
```

`workflow_executions`, `approvals`, and `audit_logs` also carry a polymorphic
`(entity_type, entity_id)` pair (no FK — the referenced entity type varies
and most entity tables don't exist yet).

`workflow_executions.status` gained `waiting_approval` in Phase 2 (existing values,
including `succeeded`, are unchanged) — see
[docs/lead-intelligence.md](../docs/lead-intelligence.md#execution-tracking).

## Entities planned for later phases

`meetings`, `meeting_action_items`, `ai_generations`, `notifications`,
`integrations` — introduced alongside the workflow that needs them, not
created wholesale up front.

## Reproducing the database from scratch

See [docs/development-setup.md](../docs/development-setup.md#database) —
`npm run db:start` + `npm run db:reset` applies every migration and the
labeled dev seed data to a fresh local Postgres instance.
