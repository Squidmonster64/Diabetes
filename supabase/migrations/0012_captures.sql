-- Immutable natural-language captures (Fragments-style source preservation)
-- for the standalone Diabetes product. Interpretation, review decisions, and
-- downstream clinical actions are stored separately so a later edit can
-- never rewrite what the patient said.
--
-- packages/bolus is unaware of these tables. Carbohydrate and dose
-- arithmetic still cross this boundary only as confirmed numeric values.

create type public.capture_source_type as enum ('typed', 'voice');
create type public.interpretation_status as enum (
  'DRAFT', 'NEEDS_CLARIFICATION', 'ACCEPTED', 'REJECTED', 'ACTIONED'
);
create type public.capture_intent as enum (
  'MEAL_BOLUS_CANDIDATE',
  'CORRECTION_CANDIDATE',
  'FOOD_ONLY',
  'GLUCOSE_LOG',
  'PRIOR_INSULIN_RECORD',
  'SETTINGS_CHANGE_ATTEMPT',
  'EMERGENCY_OR_EXCLUDED',
  'UNCLEAR'
);
create type public.capture_action_type as enum (
  'INTERPRETATION_CREATED',
  'INTERPRETATION_REVISED',
  'INTERPRETATION_ACCEPTED',
  'INTERPRETATION_REJECTED',
  'BOLUS_PREVIEW',
  'BOLUS_CONFIRMED',
  'BOLUS_REJECTED',
  'ADMINISTRATION_RECORDED',
  'SAFETY_REFUSAL',
  'SETTINGS_REDIRECT'
);

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  capture_code text not null,
  client_capture_id text,
  source_type public.capture_source_type not null,
  original_text text not null,
  normalised_text text not null,
  interpretation_json jsonb not null,
  accepted_snapshot_json jsonb,
  interpretation_status public.interpretation_status not null,
  intent public.capture_intent not null,
  intent_confidence text not null,
  contract_version text not null default 'v1',
  reference_now timestamptz not null,
  interpreted_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint captures_original_text_not_blank check (length(trim(original_text)) > 0),
  constraint captures_code_not_blank check (length(trim(capture_code)) > 0),
  constraint captures_code_unique_per_patient unique (patient_id, capture_code),
  constraint captures_client_id_unique_per_patient unique (patient_id, client_capture_id)
);

create index if not exists captures_patient_idx
  on public.captures (patient_id, created_at desc);

alter table public.captures enable row level security;

create policy "captures_select_own"
  on public.captures for select
  using (auth.uid() = patient_id);

-- Writes are performed by the API using the service-role key only.

create trigger captures_set_updated_at
  before update on public.captures
  for each row execute function public.set_updated_at();

create or replace function public.captures_protect_source()
returns trigger
language plpgsql
as $$
begin
  if new.original_text is distinct from old.original_text then
    raise exception 'original_text is immutable';
  end if;
  if new.capture_code is distinct from old.capture_code then
    raise exception 'capture_code is immutable';
  end if;
  if new.patient_id is distinct from old.patient_id then
    raise exception 'patient_id is immutable';
  end if;
  if new.client_capture_id is distinct from old.client_capture_id then
    raise exception 'client_capture_id is immutable';
  end if;
  return new;
end;
$$;

create trigger captures_protect_source
  before update on public.captures
  for each row execute function public.captures_protect_source();

create table if not exists public.capture_actions (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures (id) on delete cascade,
  patient_id uuid not null references auth.users (id) on delete cascade,
  action_type public.capture_action_type not null,
  calculation_id uuid,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint capture_actions_idempotency_unique unique (patient_id, idempotency_key)
);

create index if not exists capture_actions_capture_idx
  on public.capture_actions (capture_id, created_at desc);

create index if not exists capture_actions_calculation_idx
  on public.capture_actions (calculation_id)
  where calculation_id is not null;

alter table public.capture_actions enable row level security;

create policy "capture_actions_select_own"
  on public.capture_actions for select
  using (auth.uid() = patient_id);
