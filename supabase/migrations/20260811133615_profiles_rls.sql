grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- Team members can see each other within the same organization.
create policy profiles_select_same_org on public.profiles
  for select
  to authenticated
  using (organization_id = public.current_org_id());

-- A user can only update their own row. The profiles_protect_fields
-- trigger additionally blocks organization_id/role changes regardless of
-- this policy's WITH CHECK, so this is deliberately defense in depth
-- rather than the only guard.
create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for `authenticated`: profiles are only ever
-- created by the handle_new_user() trigger and removed via auth.users
-- cascade, never directly by client code.
