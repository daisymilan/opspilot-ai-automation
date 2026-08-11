-- Table-level grants: recent Supabase projects no longer auto-expose new
-- tables to the Data API roles, so RLS policies alone are not enough — the
-- role also needs the underlying GRANT. anon gets nothing (no anonymous
-- access to any organization data anywhere in this app).
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organizations to service_role;

-- Members can see their own organization. There is deliberately no
-- policy allowing users to see organizations they don't belong to.
create policy organizations_select_own on public.organizations
  for select
  to authenticated
  using (id = public.current_org_id());

-- Only owners/admins can update organization-level settings (e.g. name).
-- There is no insert/delete policy for `authenticated`: organizations are
-- only ever created via the handle_new_user() trigger (SECURITY DEFINER,
-- runs as the migration owner) and deletion is not exposed in this phase.
create policy organizations_update_admin on public.organizations
  for update
  to authenticated
  using (
    id = public.current_org_id()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('owner', 'admin')
    )
  )
  with check (id = public.current_org_id());
