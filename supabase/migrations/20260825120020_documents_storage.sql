-- Storage RLS for the `documents` bucket (Phase 5). The bucket itself is
-- not created here — bucket creation isn't schema DDL, so it's configured
-- locally via supabase/config.toml's [storage.buckets.documents] and, on
-- the hosted project, via the dashboard/Storage API (see
-- docs/production-deployment.md) — a policy here would silently do nothing
-- against a bucket that doesn't exist yet, which is worse than making the
-- dependency explicit.
--
-- Path convention: {organization_id}/{document_id}/{filename} — lets this
-- policy scope by path prefix the same way table RLS scopes by
-- organization_id, without a documents-table lookup on every object read.
create policy documents_bucket_select_own_org on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy documents_bucket_insert_own_org on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
