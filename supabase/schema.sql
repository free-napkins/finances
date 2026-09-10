create table if not exists public.finance_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finance_state enable row level security;

drop policy if exists "Users manage their own finance state" on public.finance_state;
create policy "Users manage their own finance state"
  on public.finance_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
