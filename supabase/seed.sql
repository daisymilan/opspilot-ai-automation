-- =============================================================================
-- DEVELOPMENT / DEMO SEED DATA ONLY.
-- Applied by `supabase db reset` (or `npm run db:reset`) against your LOCAL
-- Supabase instance. Never run this against a production project — the
-- passwords below are intentionally public knowledge.
--
-- This is not a fake integration or a mocked result: it inserts real rows
-- into a real local Postgres/Auth instance via the standard local-dev
-- seeding pattern (auth.users + auth.identities), so the
-- handle_new_user() trigger fires exactly as it would for a real signup.
-- =============================================================================

-- Two organizations, so RLS/tenant-isolation is actually exercised by seed
-- data rather than only by a single org with nothing to be isolated from.

do $$
declare
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000';

  v_acme_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_acme_member_id uuid := '22222222-2222-2222-2222-222222222222';
  v_globex_owner_id uuid := '33333333-3333-3333-3333-333333333333';

  v_acme_org_id uuid;
  v_acme_member_throwaway_org_id uuid;
  v_globex_org_id uuid;

  v_demo_password text := 'DemoPass123!';
begin
  -- --- Acme Ops: owner ---------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_instance_id, v_acme_owner_id, 'authenticated', 'authenticated',
    'owner@acme-ops.dev', crypt(v_demo_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('organization_name', 'Acme Ops', 'full_name', 'Ada Lovelace'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_acme_owner_id, v_acme_owner_id::text,
    jsonb_build_object('sub', v_acme_owner_id::text, 'email', 'owner@acme-ops.dev'),
    'email', now(), now(), now()
  );

  select organization_id into v_acme_org_id
  from public.profiles where id = v_acme_owner_id;

  -- --- Acme Ops: second member, same org ---------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_instance_id, v_acme_member_id, 'authenticated', 'authenticated',
    'member@acme-ops.dev', crypt(v_demo_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('organization_name', 'Acme Ops Seed Placeholder', 'full_name', 'Grace Hopper'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_acme_member_id, v_acme_member_id::text,
    jsonb_build_object('sub', v_acme_member_id::text, 'email', 'member@acme-ops.dev'),
    'email', now(), now(), now()
  );

  -- The trigger always creates a brand-new org per signup (that's the real
  -- product behavior) and always makes that signup its org's 'owner' (see
  -- handle_new_user()); move this second demo user into Acme Ops as a
  -- genuine non-owner 'member' — matching what docs/development-setup.md
  -- has always documented for this account — so the seed data actually
  -- has a real member-role fixture for authorization tests, then drop the
  -- throwaway placeholder org the trigger created for them.
  -- profiles_protect_fields normally blocks changing organization_id/role
  -- via UPDATE (by design, see 20260811133605_org_membership_functions.sql)
  -- — disabled here for this one seed-only reassignment, then re-enabled
  -- immediately after.
  select organization_id into v_acme_member_throwaway_org_id
  from public.profiles where id = v_acme_member_id;

  alter table public.profiles disable trigger profiles_protect_fields;

  update public.profiles
  set organization_id = v_acme_org_id, role = 'member'
  where id = v_acme_member_id;

  alter table public.profiles enable trigger profiles_protect_fields;

  delete from public.organizations where id = v_acme_member_throwaway_org_id;

  -- --- Globex Industries: separate organization, for isolation testing ---
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    v_instance_id, v_globex_owner_id, 'authenticated', 'authenticated',
    'owner@globex.dev', crypt(v_demo_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('organization_name', 'Globex Industries', 'full_name', 'Hedy Lamarr'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_globex_owner_id, v_globex_owner_id::text,
    jsonb_build_object('sub', v_globex_owner_id::text, 'email', 'owner@globex.dev'),
    'email', now(), now(), now()
  );

  select organization_id into v_globex_org_id
  from public.profiles where id = v_globex_owner_id;

  -- --- Demo leads, split across both organizations ------------------------
  insert into public.leads (organization_id, name, email, company, source, status, owner_id) values
    (v_acme_org_id, 'Marie Curie', 'marie@example.com', 'Radium Labs', 'webhook', 'new', v_acme_owner_id),
    (v_acme_org_id, 'Alan Turing', 'alan@example.com', 'Bletchley Analytics', 'manual', 'contacted', v_acme_member_id),
    (v_globex_org_id, 'Nikola Tesla', 'nikola@example.com', 'Wardenclyffe Co', 'api', 'qualified', v_globex_owner_id);
end $$;
