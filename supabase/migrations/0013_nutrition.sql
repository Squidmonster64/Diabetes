-- Nutrition Tracker user data. Food composition remains in
-- data/australian_foods.sqlite; these tables store private logs, targets,
-- saved meals, recipes and custom foods. Historical meal items keep nutrient
-- snapshots in JSON so later food-database updates cannot rewrite intake.

create table if not exists public.nutrition_profiles (
  patient_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Australia/Sydney',
  units text not null default 'metric',
  onboarding_complete boolean not null default false,
  targets_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_profiles enable row level security;
create policy "nutrition_profiles_select_own" on public.nutrition_profiles for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_targets (
  patient_id uuid primary key references auth.users (id) on delete cascade,
  targets_json jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_targets enable row level security;
create policy "nutrition_targets_select_own" on public.nutrition_targets for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_meal_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null,
  timezone text not null,
  local_date date not null,
  meal_type text not null,
  original_text text not null default '',
  transcription text,
  parse_version text not null,
  prompt_version text,
  model_version text,
  items_json jsonb not null,
  totals_json jsonb not null,
  confidence numeric not null default 0,
  source text not null,
  warnings_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_meal_logs_patient_date_idx
  on public.nutrition_meal_logs (patient_id, local_date, logged_at);

alter table public.nutrition_meal_logs enable row level security;
create policy "nutrition_meal_logs_select_own" on public.nutrition_meal_logs for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_day_status (
  patient_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  completeness text not null,
  primary key (patient_id, local_date)
);

alter table public.nutrition_day_status enable row level security;
create policy "nutrition_day_status_select_own" on public.nutrition_day_status for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_custom_foods (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  serving_description text,
  serving_grams numeric,
  nutrients_per_100g_json jsonb not null,
  source_note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_custom_foods_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists nutrition_custom_foods_patient_idx
  on public.nutrition_custom_foods (patient_id, archived_at);

alter table public.nutrition_custom_foods enable row level security;
create policy "nutrition_custom_foods_select_own" on public.nutrition_custom_foods for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_saved_meals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items_json jsonb not null,
  totals_json jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_saved_meals_name_not_blank check (length(trim(name)) > 0)
);

alter table public.nutrition_saved_meals enable row level security;
create policy "nutrition_saved_meals_select_own" on public.nutrition_saved_meals for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_recipes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings numeric not null default 1,
  total_weight_grams numeric,
  items_json jsonb not null,
  nutrients_per_serving_json jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_recipes enable row level security;
create policy "nutrition_recipes_select_own" on public.nutrition_recipes for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_favourite_foods (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  food_key text not null,
  food_name text not null,
  brand text,
  source_dataset text,
  source_food_id text,
  custom_food_id uuid,
  created_at timestamptz not null default now(),
  unique (patient_id, food_key)
);

alter table public.nutrition_favourite_foods enable row level security;
create policy "nutrition_favourite_foods_select_own" on public.nutrition_favourite_foods for select using (auth.uid() = patient_id);

create table if not exists public.nutrition_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.nutrition_events enable row level security;
create policy "nutrition_events_select_own" on public.nutrition_events for select using (auth.uid() = patient_id);
