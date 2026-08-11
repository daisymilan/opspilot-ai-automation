-- Append-only audit trail. Written by the service role only, so a
-- compromised or malicious client cannot forge or flood entries; no role
-- (not even service_role) is granted update/delete, so rows are
-- immutable by construction once written.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(btrim(action)) > 0),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail. No update/delete is granted to any role.';

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

alter table public.audit_logs enable row level security;

grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;

create policy audit_logs_select_own_org on public.audit_logs
  for select
  to authenticated
  using (organization_id = public.current_org_id());
