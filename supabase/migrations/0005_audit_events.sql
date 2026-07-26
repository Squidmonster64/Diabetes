-- Immutable, hash-chained audit trail.
-- BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md sections 7.7, 9.7.
-- Distinct from calculations (user-visible history) and from operational
-- application logs (never stored in this table) - APP_BUILD_PROMPT.md section 14.

create type public.audit_event_type as enum (
  'CALCULATION_STARTED', 'CALCULATION_REFUSED', 'CALCULATION_COMPLETED',
  'CALCULATION_VIEWED', 'CALCULATION_CONFIRMED', 'CALCULATION_EXPIRED',
  'CALCULATION_INVALIDATED', 'ADMINISTRATION_RECORDED',
  'CONFIGURATION_CREATED', 'CONFIGURATION_APPROVED',
  'CONFIGURATION_ACTIVATED', 'CONFIGURATION_REVOKED'
);

create table if not exists public.audit_events (
  sequence bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid(),
  event_type public.audit_event_type not null,
  patient_id uuid not null references auth.users (id) on delete cascade,
  calculation_id uuid references public.calculations (id),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  previous_hash text,
  event_hash text not null,
  offline boolean not null default false,
  sync_status text not null default 'synced',
  created_at timestamptz not null default now(),

  constraint audit_events_event_id_unique unique (event_id)
);

create index if not exists audit_events_patient_idx
  on public.audit_events (patient_id, occurred_at desc);

create index if not exists audit_events_calculation_idx
  on public.audit_events (calculation_id);

alter table public.audit_events enable row level security;

create policy "audit_events_select_own"
  on public.audit_events for select
  using (auth.uid() = patient_id);

-- Append-only from the client's perspective: no update/delete policy exists
-- for any role, including via RLS-bypassing service-role writes performed
-- through the API, which only ever inserts.
