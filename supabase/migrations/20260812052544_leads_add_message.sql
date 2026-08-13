-- The lead intake form now accepts an optional free-text message/description
-- from the submitter — this is the primary signal the AI analysis reads
-- (see services/ai/prompts/leadAnalysis.ts), so it needs to be persisted.
alter table public.leads
  add column message text check (message is null or char_length(message) <= 2000);
