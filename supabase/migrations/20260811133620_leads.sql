create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company text,
  source text not null default 'manual'
    check (source in ('manual', 'webhook', 'api', 'import')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'disqualified', 'converted')),
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.leads is 'Foundation lead record. AI classification/scoring fields land in a later phase.';

create index leads_organization_id_idx on public.leads (organization_id);
create index leads_owner_id_idx on public.leads (owner_id);
create index leads_status_idx on public.leads (organization_id, status);

-- Prevents duplicate leads by email within a single organization (the
-- basis for the AI Lead Intelligence duplicate-check step in a later
-- phase). Partial index: leads without an email are not constrained.
create unique index leads_org_email_unique_idx
  on public.leads (organization_id, email)
  where email is not null;

create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- Data-integrity guard: a lead's owner must belong to the lead's own
-- organization. Not expressible as a plain CHECK constraint (needs a
-- lookup), so enforced via trigger instead.
create or replace function public.leads_validate_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null and not exists (
    select 1 from public.profiles
    where profiles.id = new.owner_id
      and profiles.organization_id = new.organization_id
  ) then
    raise exception 'owner_id must belong to the same organization as the lead';
  end if;
  return new;
end;
$$;

create trigger leads_validate_owner_trigger
  before insert or update on public.leads
  for each row
  execute function public.leads_validate_owner();

alter table public.leads enable row level security;

grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.leads to service_role;

create policy leads_select_own_org on public.leads
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy leads_insert_own_org on public.leads
  for insert
  to authenticated
  with check (organization_id = public.current_org_id());

create policy leads_update_own_org on public.leads
  for update
  to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

create policy leads_delete_own_org on public.leads
  for delete
  to authenticated
  using (organization_id = public.current_org_id());
