-- current_org_id(): the single source every RLS policy checks against.
-- SECURITY DEFINER so it can read public.profiles regardless of the caller's
-- own RLS visibility into that table (avoids recursive-RLS deadlocks).
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_org_id() to authenticated, service_role;

-- Signup creates a new workspace atomically: the client passes
-- organization_name and full_name as auth signup metadata; this trigger
-- creates the organization and the owner's profile in the same transaction
-- as the auth.users insert, so there's no window where a user exists
-- without an organization (or vice versa).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_name text := btrim(coalesce(new.raw_user_meta_data ->> 'organization_name', ''));
  v_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
  v_org_id uuid;
begin
  if v_org_name = '' then
    raise exception 'organization_name is required in signup metadata';
  end if;
  if v_full_name = '' then
    raise exception 'full_name is required in signup metadata';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'org';
  end if;

  v_slug := v_base_slug;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (name, slug)
  values (v_org_name, v_slug)
  returning id into v_org_id;

  -- First member of a newly created organization is its owner.
  insert into public.profiles (id, organization_id, full_name, email, role)
  values (new.id, v_org_id, v_full_name, new.email, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Defense in depth: organization_id and role must never change via a plain
-- UPDATE, even if a future bug in application code or RLS policy would
-- otherwise allow it. Role/org changes belong to dedicated, explicitly
-- authorized admin operations introduced in a later phase.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed directly';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_fields();
