-- AI-generated document extraction (Phase 5). Written by the service role
-- only (the document-analysis pipeline, triggered via n8n) — never by an
-- authenticated client directly, so a compromised or buggy client cannot
-- inject fake "AI-generated" extractions. Mirrors lead_scores.sql exactly,
-- including one row per analysis run (re-analysis produces a new row
-- rather than overwriting the old one).
create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  vendor_name text,
  invoice_number text,
  amount numeric(12, 2) check (amount is null or amount >= 0),
  currency text check (currency is null or char_length(currency) = 3),
  due_date date,
  line_items jsonb not null default '[]'::jsonb,
  confidence numeric(3, 2) not null check (confidence >= 0 and confidence <= 1),
  model text not null check (char_length(btrim(model)) > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.document_extractions is
  'AI-generated document extraction history (Phase 5). One row per analysis run. Written by the service role only.';

create index document_extractions_organization_id_idx on public.document_extractions (organization_id);
create index document_extractions_document_id_created_idx
  on public.document_extractions (document_id, created_at desc);

-- Data-integrity guard, same pattern as lead_scores_validate_lead: an
-- extraction's organization_id must match the organization_id of the
-- document it extracts.
create or replace function public.document_extractions_validate_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.documents
    where documents.id = new.document_id
      and documents.organization_id = new.organization_id
  ) then
    raise exception 'document_id must belong to the same organization as the extraction';
  end if;
  return new;
end;
$$;

create trigger document_extractions_validate_document_trigger
  before insert or update on public.document_extractions
  for each row
  execute function public.document_extractions_validate_document();

alter table public.document_extractions enable row level security;

-- Read-only for authenticated users, same reasoning as lead_scores:
-- AI-generated fields are not client-writable, only readable within the
-- caller's own organization.
grant select on public.document_extractions to authenticated;
grant select, insert, update, delete on public.document_extractions to service_role;

create policy document_extractions_select_own_org on public.document_extractions
  for select
  to authenticated
  using (organization_id = public.current_org_id());
