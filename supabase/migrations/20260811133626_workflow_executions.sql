-- System-generated execution telemetry. Written by the backend/service role
-- only (n8n / API routes acting with elevated privileges) once workflow
-- logic exists in a later phase; end users can only ever read their own
-- organization's executions.
create table public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  workflow_name text not null check (char_length(btrim(workflow_name)) > 0),
  entity_type text,
  entity_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'retrying')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at)
);

comment on table public.workflow_executions is
  'Observability record for every automation run. Written by the service role only.';

create index workflow_executions_org_started_idx
  on public.workflow_executions (organization_id, started_at desc);
create index workflow_executions_org_status_idx
  on public.workflow_executions (organization_id, status);
create index workflow_executions_entity_idx
  on public.workflow_executions (entity_type, entity_id);

alter table public.workflow_executions enable row level security;

-- Read-only for authenticated users: no insert/update/delete grant, so
-- writes are only possible via the service role (which bypasses RLS and
-- has its own explicit grant below). This is intentionally not
-- "authenticated users can access everything."
grant select on public.workflow_executions to authenticated;
grant select, insert, update, delete on public.workflow_executions to service_role;

create policy workflow_executions_select_own_org on public.workflow_executions
  for select
  to authenticated
  using (organization_id = public.current_org_id());
