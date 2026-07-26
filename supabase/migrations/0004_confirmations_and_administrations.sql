-- Confirmation and administration events.
-- BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md sections 7.5, 7.6.
-- Confirmation is a one-to-zero-or-one relationship to a calculation.

create table if not exists public.calculation_confirmations (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null unique references public.calculations (id),
  patient_id uuid not null references auth.users (id) on delete cascade,
  confirmed boolean not null,
  confirmation_text_accepted boolean not null,
  confirmed_at timestamptz not null,
  snapshot_hash text not null,
  confirmation_hash text not null,
  created_at timestamptz not null default now(),

  constraint calculation_confirmations_must_be_confirmed check (
    confirmed = true and confirmation_text_accepted = true
  )
);

alter table public.calculation_confirmations enable row level security;

create policy "calculation_confirmations_select_own"
  on public.calculation_confirmations for select
  using (auth.uid() = patient_id);

create table if not exists public.insulin_administrations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  calculation_id uuid references public.calculations (id),
  administered_units text not null,
  administered_at timestamptz not null,
  source text not null default 'MANUAL',
  entered_manually boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  record_checksum text not null,

  constraint insulin_administrations_manual_only check (source = 'MANUAL')
);

create index if not exists insulin_administrations_patient_idx
  on public.insulin_administrations (patient_id, administered_at desc);

alter table public.insulin_administrations enable row level security;

create policy "insulin_administrations_select_own"
  on public.insulin_administrations for select
  using (auth.uid() = patient_id);

-- Writes performed only by the API via the service-role key; no client write
-- policies are granted.
