create table public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id text not null,
  title text not null default 'Nouvelle tâche',
  description jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  position integer not null default 0,
  due_date date,
  due_time time,
  estimated_duration integer check (estimated_duration is null or estimated_duration >= 0),
  complexity text not null default 'medium' check (complexity in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cards_board_column_position_idx on public.cards (board_id, column_id, position);

create function public.set_cards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_set_updated_at
before update on public.cards
for each row execute function public.set_cards_updated_at();

alter table public.cards enable row level security;

create policy "Clients can read cards from their boards"
  on public.cards for select
  using (exists (select 1 from public.boards where boards.id = cards.board_id and boards.owner_id = auth.uid()));

create policy "Clients can create cards in their boards"
  on public.cards for insert
  with check (exists (select 1 from public.boards where boards.id = cards.board_id and boards.owner_id = auth.uid()));

create policy "Clients can update cards from their boards"
  on public.cards for update
  using (exists (select 1 from public.boards where boards.id = cards.board_id and boards.owner_id = auth.uid()))
  with check (exists (select 1 from public.boards where boards.id = cards.board_id and boards.owner_id = auth.uid()));

create policy "Clients can delete cards from their boards"
  on public.cards for delete
  using (exists (select 1 from public.boards where boards.id = cards.board_id and boards.owner_id = auth.uid()));
