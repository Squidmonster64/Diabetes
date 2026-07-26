-- User-created foods: packet-label entries (transcribed from a nutrition
-- information panel) and manual entries (a quick ad-hoc carbohydrate value).
-- These are distinct from the read-only AUSNUT/AFCD database
-- (data/australian_foods.sqlite) - see FOOD_ADAPTER.md. They still cross
-- into the bolus module only as a confirmed numeric carbohydrate-gram
-- value; packages/bolus has no knowledge of this table.

create type public.custom_food_type as enum ('PACKET_LABEL', 'MANUAL');

create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  food_type public.custom_food_type not null,
  name text not null,
  brand text,

  -- Packet-label fields: as printed on the nutrition information panel.
  -- Carbohydrate is stored per-100g as the canonical figure; when the
  -- patient transcribes a per-serving figure instead, serving_grams and
  -- carbohydrate_per_serving_grams are also stored (for provenance/display)
  -- and carbohydrate_per_100g_grams is derived deterministically
  -- (same rule as the official database: no rounding beyond the source
  -- data's own precision, no substitution of total for available carb).
  serving_description text,
  serving_grams text,
  carbohydrate_per_serving_grams text,
  carbohydrate_per_100g_grams text,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint custom_foods_name_not_blank check (length(trim(name)) > 0),
  constraint custom_foods_has_carbohydrate_data check (
    carbohydrate_per_100g_grams is not null
    or (carbohydrate_per_serving_grams is not null and serving_grams is not null)
  )
);

create index if not exists custom_foods_patient_idx
  on public.custom_foods (patient_id, archived_at);

alter table public.custom_foods enable row level security;

create policy "custom_foods_select_own"
  on public.custom_foods for select
  using (auth.uid() = patient_id);

-- Writes performed by the API using the service-role key only, matching
-- every other user-owned table in this schema (see RLS_REVIEW.md).

create trigger custom_foods_set_updated_at
  before update on public.custom_foods
  for each row execute function public.set_updated_at();
