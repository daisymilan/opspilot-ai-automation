-- Adds 'waiting_approval' as a valid workflow_executions.status value, for
-- pipelines (like lead intelligence) that pause on a human-in-the-loop
-- approval rather than running straight through to completion.
--
-- Existing values are kept as-is — 'succeeded' is not renamed to
-- 'completed' — so no existing data or application code that already
-- reads this column needs to change.
alter table public.workflow_executions
  drop constraint workflow_executions_status_check;

alter table public.workflow_executions
  add constraint workflow_executions_status_check
  check (status in ('pending', 'running', 'succeeded', 'failed', 'retrying', 'waiting_approval'));
