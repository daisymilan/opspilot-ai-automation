-- Human-in-the-loop queue: gates AI-recommended actions before they execute.
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  entity_type text not null check (char_length(btrim(entity_type)) > 0),
  entity_id uuid not null,
  action_type text not null check (char_length(btrim(action_type)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  ),
  check (status <> 'rejected' or rejection_reason is not null)
);

comment on table public.approvals is
  'Human approval gate for sensitive AI-recommended actions. Reviewed by owner/admin only.';

create index approvals_organization_id_idx on public.approvals (organization_id);
create index approvals_org_status_idx on public.approvals (organization_id, status);
create index approvals_entity_idx on public.approvals (entity_type, entity_id);

create trigger approvals_set_updated_at
  before update on public.approvals
  for each row
  execute function public.set_updated_at();

alter table public.approvals enable row level security;

-- No delete grant: approvals are a permanent record of what was
-- requested and decided, never removable by client code.
grant select, insert, update on public.approvals to authenticated;
grant select, insert, update, delete on public.approvals to service_role;

create policy approvals_select_own_org on public.approvals
  for select
  to authenticated
  using (organization_id = public.current_org_id());

-- Any org member can request an approval.
create policy approvals_insert_own_org on public.approvals
  for insert
  to authenticated
  with check (organization_id = public.current_org_id());

-- Only owners/admins can review (approve/reject) — reinforces the
-- human-approval trust boundary at the database level, not just in the UI.
create policy approvals_update_reviewer on public.approvals
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'admin')
    )
  )
  with check (organization_id = public.current_org_id());
