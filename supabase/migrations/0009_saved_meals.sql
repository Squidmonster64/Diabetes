-- Saved, reusable multi-food meals. A meal is a named recipe of components,
-- each referencing either an official AUSNUT/AFCD food or a custom food, with
-- an editable quantity. Total carbohydrate for a meal is always computed at
-- use-time from current component quantities and current food composition
-- data (never stored as a stale snapshot) - see FOOD_ADAPTER.md. As with
-- every food-side table, this never crosses into packages/bolus except as a
-- final confirmed numeric carbohydrate-gram value.

create type public.meal_component_source as enum ('AUSNUT', 'AFCD', 'CUSTOM');
create type public.meal_component_quantity_kind as enum ('GRAMS', 'MILLILITRES', 'MEASURE');

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  duplicated_from_meal_id uuid references public.saved_meals (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_meals_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists saved_meals_patient_idx
  on public.saved_meals (patient_id, archived_at);

alter table public.saved_meals enable row level security;

create policy "saved_meals_select_own"
  on public.saved_meals for select
  using (auth.uid() = patient_id);

create trigger saved_meals_set_updated_at
  before update on public.saved_meals
  for each row execute function public.set_updated_at();

create table if not exists public.saved_meal_components (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.saved_meals (id) on delete cascade,
  patient_id uuid not null references auth.users (id) on delete cascade,
  position integer not null default 0,

  component_source public.meal_component_source not null,
  source_dataset text,
  source_food_id text,
  custom_food_id uuid references public.custom_foods (id) on delete restrict,

  label text not null,

  quantity_kind public.meal_component_quantity_kind not null,
  quantity_grams text,
  quantity_millilitres text,
  measure_id text,
  measure_multiplier text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_meal_components_label_not_blank check (length(trim(label)) > 0),
  constraint saved_meal_components_official_or_custom check (
    (component_source in ('AUSNUT', 'AFCD') and source_dataset is not null and source_food_id is not null and custom_food_id is null)
    or (component_source = 'CUSTOM' and custom_food_id is not null and source_dataset is null and source_food_id is null)
  ),
  constraint saved_meal_components_quantity_matches_kind check (
    (quantity_kind = 'GRAMS' and quantity_grams is not null)
    or (quantity_kind = 'MILLILITRES' and quantity_millilitres is not null)
    or (quantity_kind = 'MEASURE' and measure_id is not null and measure_multiplier is not null)
  )
);

create index if not exists saved_meal_components_meal_idx
  on public.saved_meal_components (meal_id, position);

create index if not exists saved_meal_components_patient_idx
  on public.saved_meal_components (patient_id);

alter table public.saved_meal_components enable row level security;

create policy "saved_meal_components_select_own"
  on public.saved_meal_components for select
  using (auth.uid() = patient_id);

create trigger saved_meal_components_set_updated_at
  before update on public.saved_meal_components
  for each row execute function public.set_updated_at();

-- Writes to both tables performed by the API using the service-role key
-- only, matching every other user-owned table in this schema.
