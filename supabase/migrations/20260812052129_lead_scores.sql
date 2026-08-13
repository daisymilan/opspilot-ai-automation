-- AI-generated lead intelligence. Written by the service role only (the
-- lead-analysis pipeline, triggered via n8n) — never by an authenticated
-- client directly, so a compromised or buggy client cannot inject fake
-- "AI-generated" scores. This mirrors workflow_executions' and
-- audit_logs' existing read-only-for-authenticated shape.
--
-- One row per analysis run (not one row per lead): re-analysis produces a
-- new row rather than overwriting the old one, so the history of what the
-- AI said and when is preserved — consistent with model/prompt_version
-- being recorded per generation.
create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  priority text not null check (priority in ('low', 'medium', 'high')),
  intent text not null check (char_length(btrim(intent)) > 0),
  industry text,
  confidence numeric(3, 2) not null check (confidence >= 0 and confidence <= 1),
  recommended_action text not null
    check (recommended_action in ('schedule_call', 'send_follow_up', 'assign_sales_owner', 'manual_review')),
  reasoning_summary text not null check (char_length(btrim(reasoning_summary)) > 0),
  model text not null check (char_length(btrim(model)) > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.lead_scores is
  'AI-generated lead analysis history. One row per analysis run. Written by the service role only.';

create index lead_scores_organization_id_idx on public.lead_scores (organization_id);
create index lead_scores_lead_id_created_idx on public.lead_scores (lead_id, created_at desc);

-- Data-integrity guard, same pattern as leads_validate_owner: a score's
-- organization_id must match the organization_id of the lead it scores.
create or replace function public.lead_scores_validate_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.leads
    where leads.id = new.lead_id
      and leads.organization_id = new.organization_id
  ) then
    raise exception 'lead_id must belong to the same organization as the score';
  end if;
  return new;
end;
$$;

create trigger lead_scores_validate_lead_trigger
  before insert or update on public.lead_scores
  for each row
  execute function public.lead_scores_validate_lead();

alter table public.lead_scores enable row level security;

-- Read-only for authenticated users, same reasoning as workflow_executions:
-- AI-generated fields are not client-writable, only readable within the
-- caller's own organization.
grant select on public.lead_scores to authenticated;
grant select, insert, update, delete on public.lead_scores to service_role;

create policy lead_scores_select_own_org on public.lead_scores
  for select
  to authenticated
  using (organization_id = public.current_org_id());
