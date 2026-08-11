-- Extensions used by later migrations.
-- gen_random_uuid() is built into Postgres 13+ core and needs no extension.
-- pgcrypto is required for crypt()/gen_salt(), used only in supabase/seed.sql
-- to hash demo user passwords for local development.
create extension if not exists pgcrypto with schema extensions;
