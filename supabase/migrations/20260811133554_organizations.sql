-- Tenant root: every org-owned table hangs off organizations.id.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Tenant root. All organization-owned data references this table and is isolated by RLS.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

-- RLS is enabled here but policies are added later (20260811133610_organizations_rls.sql)
-- once current_org_id() exists, so the table is never briefly open with no RLS at all.
alter table public.organizations enable row level security;
