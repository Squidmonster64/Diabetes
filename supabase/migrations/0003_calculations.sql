-- Calculation requests and results.
-- BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md sections 7.2, 7.3.

create type public.calculation_mode as enum ('MEAL', 'CORRECTION_ONLY');
create type public.glucose_source as enum ('FINGERSTICK', 'CGM', 'MANUAL_TRANSCRIPTION');
create type public.calculation_state as enum (
  'REFUSED', 'CALCULATED', 'CALCULATED_ZERO', 'USER_CONFIRMED',
  'EXPIRED', 'INVALIDATED', 'ADMINISTRATION_RECORDED'
);

create table if not exists public.calculation_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  configuration_id uuid references public.clinician_configurations (id),
  mode public.calculation_mode not null,
  current_glucose text not null,
  glucose_unit public.glucose_unit not null,
  glucose_source public.glucose_source not null,
  glucose_timestamp timestamptz not null,
  glucose_confirmed boolean not null,
  glucose_trend text,
  carbohydrate_grams text not null,
  carbohydrates_confirmed boolean not null,
  carbohydrate_provenance jsonb,
  active_insulin_units text,
  recent_history_complete boolean not null,
  prior_rapid_acting_doses_snapshot jsonb not null default '[]'::jsonb,
  hypo_symptoms boolean not null,
  duplicate_dose boolean not null,
  special_situations text[] not null default '{}',
  calculated_at timestamptz not null,
  input_checksum text,
  created_at timestamptz not null default now()
);

create index if not exists calculation_requests_patient_idx
  on public.calculation_requests (patient_id, created_at desc);

alter table public.calculation_requests enable row level security;

create policy "calculation_requests_select_own"
  on public.calculation_requests for select
  using (auth.uid() = patient_id);

create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.calculation_requests (id),
  patient_id uuid not null references auth.users (id) on delete cascade,
  configuration_id uuid references public.clinician_configurations (id),
  state public.calculation_state not null,

  meal_component_units text,
  correction_component_units text,
  active_insulin_adjustment_units text,
  unrounded_total_units text,
  rounded_total_units text,

  dose_increment_units text,
  maximum_dose_units text,
  refusal_code text,
  explanation jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,

  configuration_version integer,
  calculator_version text not null,
  safety_policy_version text not null,

  created_at timestamptz not null default now(),
  expires_at timestamptz,
  result_checksum text not null,

  confirmed_at timestamptz,
  confirmation_hash text,
  invalidated_at timestamptz,
  invalidation_reason text,
  administered_units text,
  administered_at timestamptz,

  constraint calculations_refusal_has_no_dose check (
    state <> 'REFUSED' or (
      meal_component_units is null and correction_component_units is null and
      unrounded_total_units is null and rounded_total_units is null
    )
  )
);

create index if not exists calculations_patient_idx
  on public.calculations (patient_id, created_at desc);

alter table public.calculations enable row level security;

create policy "calculations_select_own"
  on public.calculations for select
  using (auth.uid() = patient_id);

-- All writes to calculation_requests/calculations are performed by the API
-- using the service-role key. No write policies are granted here, so direct
-- client inserts/updates are always denied by RLS.
