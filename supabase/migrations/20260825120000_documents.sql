-- Uploaded document record (Phase 5, AI Document Intelligence). Mirrors
-- leads.sql: client-writable, own-org only. The actual file bytes live in
-- the `documents` storage bucket at file_path; this row is the queryable
-- metadata + status the UI lists against.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_path text not null check (char_length(btrim(file_path)) > 0),
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes > 0),
  document_type text not null default 'invoice' check (document_type in ('invoice')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'extracted', 'failed')),
  created_at timestamptz not null default now()
);

comment on table public.documents is
  'Uploaded document metadata (Phase 5). File bytes live in the documents storage bucket at file_path.';

create index documents_organization_id_idx on public.documents (organization_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);
create index documents_org_status_idx on public.documents (organization_id, status);

-- Prevents the same storage object from being claimed by two rows.
create unique index documents_file_path_unique_idx on public.documents (file_path);

-- Data-integrity guard, same pattern as leads_validate_owner: an uploader
-- must belong to the document's own organization.
create or replace function public.documents_validate_uploader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.uploaded_by is not null and not exists (
    select 1 from public.profiles
    where profiles.id = new.uploaded_by
      and profiles.organization_id = new.organization_id
  ) then
    raise exception 'uploaded_by must belong to the same organization as the document';
  end if;
  return new;
end;
$$;

create trigger documents_validate_uploader_trigger
  before insert or update on public.documents
  for each row
  execute function public.documents_validate_uploader();

alter table public.documents enable row level security;

grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.documents to service_role;

create policy documents_select_own_org on public.documents
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy documents_insert_own_org on public.documents
  for insert
  to authenticated
  with check (organization_id = public.current_org_id());

create policy documents_update_own_org on public.documents
  for update
  to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

create policy documents_delete_own_org on public.documents
  for delete
  to authenticated
  using (organization_id = public.current_org_id());
