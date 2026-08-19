-- Applied after 0010 so ONLINE_CONFIRMED is a committed enum value.
alter table public.custom_foods
  add column if not exists source_name text,
  add column if not exists source_reference text,
  add column if not exists source_retrieved_at timestamptz;

alter table public.custom_foods
  add constraint custom_foods_online_confirmation_has_source check (
    food_type <> 'ONLINE_CONFIRMED'
    or (source_name is not null and source_reference is not null and source_retrieved_at is not null)
  );
