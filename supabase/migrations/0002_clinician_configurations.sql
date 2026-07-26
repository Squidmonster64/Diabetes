-- Patient-entered clinician-report settings versions.
-- BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 7.1 / section 2.1.
-- Immutable once created except for status transitions (ACTIVE -> SUPERSEDED /
-- REVOKED / EXPIRED) performed by the API using the service-role key.

create type public.configuration_status as enum (
  'DRAFT', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REVOKED', 'EXPIRED'
);

create type public.insulin_duration_entry_source as enum (
  'PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION',
  'PATIENT_ENTERED_FROM_CLINICIAN_REPORT'
);

create type public.glucose_unit as enum ('MMOL_L', 'MG_DL');

create table if not exists public.clinician_configurations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  status public.configuration_status not null default 'ACTIVE',

  icr text not null,
  isf text not null,
  target_glucose text not null,
  insulin_duration_hours text not null,
  dose_increment_units text not null,
  maximum_dose_units text not null,
  low_glucose_threshold text not null,
  glucose_unit public.glucose_unit not null,

  insulin_duration_entry_source public.insulin_duration_entry_source not null,
  insulin_duration_source_date date,
  insulin_duration_source_reference text,
  insulin_duration_entered_at timestamptz not null,
  insulin_duration_patient_confirmed_accurate boolean not null,
  insulin_duration_patient_confirmed_at timestamptz not null,

  schema_version text not null default '1.0',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  superseded_at timestamptz,
  revoked_at timestamptz,
  configuration_checksum text not null,
  created_at timestamptz not null default now(),

  constraint clinician_configurations_patient_version_unique unique (patient_id, version),
  constraint clinician_configurations_dia_confirmed check (insulin_duration_patient_confirmed_accurate = true)
);

-- Only one ACTIVE configuration per patient at a time.
create unique index if not exists clinician_configurations_one_active_per_patient
  on public.clinician_configurations (patient_id)
  where (status = 'ACTIVE');

create index if not exists clinician_configurations_patient_idx
  on public.clinician_configurations (patient_id, version desc);

alter table public.clinician_configurations enable row level security;

create policy "clinician_configurations_select_own"
  on public.clinician_configurations for select
  using (auth.uid() = patient_id);

-- Inserts/updates are performed by the API using the service-role key, which
-- bypasses RLS. No insert/update/delete policy is granted to the anon or
-- authenticated roles, so direct client writes are always denied.
