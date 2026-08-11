-- Shared trigger function: keeps an `updated_at` column current on every row update.
-- Used by every table below that has an updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
