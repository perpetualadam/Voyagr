-- Voyagr profile snapshots table (auto-created on first DB init)
-- This replaces the Supabase Cloud table.

create table if not exists public.voyagr_profile_snapshots (
  user_id uuid not null,
  profile_id text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create or replace function public.voyagr_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists voyagr_set_updated_at on public.voyagr_profile_snapshots;
create trigger voyagr_set_updated_at
before update on public.voyagr_profile_snapshots
for each row execute function public.voyagr_set_updated_at();

-- RLS: users can only access their own snapshots
alter table public.voyagr_profile_snapshots enable row level security;

drop policy if exists "profile_snapshots_select_own" on public.voyagr_profile_snapshots;
create policy "profile_snapshots_select_own"
on public.voyagr_profile_snapshots for select
using (auth.uid() = user_id);

drop policy if exists "profile_snapshots_insert_own" on public.voyagr_profile_snapshots;
create policy "profile_snapshots_insert_own"
on public.voyagr_profile_snapshots for insert
with check (auth.uid() = user_id);

drop policy if exists "profile_snapshots_update_own" on public.voyagr_profile_snapshots;
create policy "profile_snapshots_update_own"
on public.voyagr_profile_snapshots for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "profile_snapshots_delete_own" on public.voyagr_profile_snapshots;
create policy "profile_snapshots_delete_own"
on public.voyagr_profile_snapshots for delete
using (auth.uid() = user_id);
