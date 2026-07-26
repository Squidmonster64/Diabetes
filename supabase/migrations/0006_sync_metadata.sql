-- Offline sync metadata for the PWA's local queue.
-- APP_BUILD_PROMPT.md section 12: queue non-clinical sync operations safely
-- and prevent duplicate submission after reconnection.

create table if not exists public.sync_metadata (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  client_operation_id uuid not null,
  operation_type text not null,
  status text not null default 'pending',
  last_attempted_at timestamptz,
  synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),

  constraint sync_metadata_client_operation_unique unique (patient_id, client_operation_id)
);

create index if not exists sync_metadata_patient_idx
  on public.sync_metadata (patient_id, status);

alter table public.sync_metadata enable row level security;

create policy "sync_metadata_select_own"
  on public.sync_metadata for select
  using (auth.uid() = patient_id);

-- Writes performed by the API using the service-role key only.
