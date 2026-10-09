create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Personnel' check (length(trim(name)) > 0),
  color text not null default 'primary',
  created_at timestamptz not null default now()
);

create index workspaces_owner_idx on public.workspaces (owner_id, created_at);

alter table public.workspaces enable row level security;

create policy "Clients can read their workspaces"
  on public.workspaces for select
  using (auth.uid() = owner_id);

create policy "Clients can create their workspaces"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

create policy "Clients can update their workspaces"
  on public.workspaces for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Clients can delete their workspaces"
  on public.workspaces for delete
  using (auth.uid() = owner_id);

-- Single place deciding who can reach a workspace; membership will extend it.
create function public.can_access_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces
    where workspaces.id = target_workspace_id and workspaces.owner_id = auth.uid()
  );
$$;

revoke execute on function public.can_access_workspace(uuid) from public, anon;
grant execute on function public.can_access_workspace(uuid) to authenticated;

-- Existing accounts: one default workspace holding their current boards.
alter table public.boards add column workspace_id uuid references public.workspaces(id) on delete cascade;

insert into public.workspaces (owner_id, name, color)
select distinct owner_id, 'Personnel', 'primary' from public.boards;

update public.boards
set workspace_id = workspaces.id
from public.workspaces
where workspaces.owner_id = boards.owner_id;

alter table public.boards alter column workspace_id set not null;

create function public.can_access_board(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.boards
    where boards.id = target_board_id and public.can_access_workspace(boards.workspace_id)
  );
$$;

revoke execute on function public.can_access_board(uuid) from public, anon;
grant execute on function public.can_access_board(uuid) to authenticated;

create index boards_workspace_created_idx on public.boards (workspace_id, created_at);

drop policy "Clients can read their boards" on public.boards;
drop policy "Clients can create their boards" on public.boards;
drop policy "Clients can update their boards" on public.boards;
drop policy "Clients can delete their boards" on public.boards;

create policy "Members can read workspace boards"
  on public.boards for select
  using (public.can_access_workspace(workspace_id));

create policy "Members can create workspace boards"
  on public.boards for insert
  with check (public.can_access_workspace(workspace_id));

create policy "Members can update workspace boards"
  on public.boards for update
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Members can delete workspace boards"
  on public.boards for delete
  using (public.can_access_workspace(workspace_id));

drop policy "Clients can read cards from their boards" on public.cards;
drop policy "Clients can create cards in their boards" on public.cards;
drop policy "Clients can update cards from their boards" on public.cards;
drop policy "Clients can delete cards from their boards" on public.cards;

create policy "Members can read board cards"
  on public.cards for select
  using (public.can_access_board(board_id));

create policy "Members can create board cards"
  on public.cards for insert
  with check (public.can_access_board(board_id));

create policy "Members can update board cards"
  on public.cards for update
  using (public.can_access_board(board_id))
  with check (public.can_access_board(board_id));

create policy "Members can delete board cards"
  on public.cards for delete
  using (public.can_access_board(board_id));

drop policy "Clients can read columns from their boards" on public.board_columns;
drop policy "Clients can create columns in their boards" on public.board_columns;
drop policy "Clients can update columns from their boards" on public.board_columns;
drop policy "Clients can delete columns from their boards" on public.board_columns;

create policy "Members can read board columns"
  on public.board_columns for select
  using (public.can_access_board(board_id));

create policy "Members can create board columns"
  on public.board_columns for insert
  with check (public.can_access_board(board_id));

create policy "Members can update board columns"
  on public.board_columns for update
  using (public.can_access_board(board_id))
  with check (public.can_access_board(board_id));

create policy "Members can delete board columns"
  on public.board_columns for delete
  using (public.can_access_board(board_id));

alter table public.boards drop column owner_id;
