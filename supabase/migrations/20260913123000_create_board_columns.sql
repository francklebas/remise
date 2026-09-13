create table public.board_columns (
  board_id uuid not null references public.boards(id) on delete cascade,
  id text not null,
  title text not null,
  position integer not null default 0,
  primary key (board_id, id)
);

create index board_columns_board_position_idx on public.board_columns (board_id, position);

alter table public.board_columns enable row level security;

create policy "Clients can read columns from their boards"
  on public.board_columns for select
  using (exists (select 1 from public.boards where boards.id = board_columns.board_id and boards.owner_id = auth.uid()));

create policy "Clients can create columns in their boards"
  on public.board_columns for insert
  with check (exists (select 1 from public.boards where boards.id = board_columns.board_id and boards.owner_id = auth.uid()));

create policy "Clients can update columns from their boards"
  on public.board_columns for update
  using (exists (select 1 from public.boards where boards.id = board_columns.board_id and boards.owner_id = auth.uid()))
  with check (exists (select 1 from public.boards where boards.id = board_columns.board_id and boards.owner_id = auth.uid()));

create policy "Clients can delete columns from their boards"
  on public.board_columns for delete
  using (exists (select 1 from public.boards where boards.id = board_columns.board_id and boards.owner_id = auth.uid()));
