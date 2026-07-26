-- User profile table. One row per authenticated patient, keyed by auth.uid().
-- APP_BUILD_PROMPT.md section 11: every user-owned table must include the
-- authenticated user identifier and be protected by Row Level Security.

create table if not exists public.profiles (
  patient_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_adult boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = patient_id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = patient_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = patient_id)
  with check (auth.uid() = patient_id);

-- No delete policy: profile deletion is handled by auth.users cascade only.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
