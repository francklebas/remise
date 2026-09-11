create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mon espace de travail',
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;

create policy "Clients can read their boards"
  on public.boards for select
  using (auth.uid() = owner_id);

create policy "Clients can create their boards"
  on public.boards for insert
  with check (auth.uid() = owner_id);

create policy "Clients can update their boards"
  on public.boards for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Clients can delete their boards"
  on public.boards for delete
  using (auth.uid() = owner_id);
