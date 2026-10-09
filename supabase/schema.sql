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

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Mon espace de travail' constraint boards_name_not_blank check (length(trim(name)) > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index boards_workspace_created_idx on public.boards (workspace_id, created_at);

alter table public.boards enable row level security;

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

create table public.board_columns (
  board_id uuid not null references public.boards(id) on delete cascade,
  id text not null,
  title text not null,
  position integer not null default 0,
  primary key (board_id, id)
);

create index board_columns_board_position_idx on public.board_columns (board_id, position);

alter table public.board_columns enable row level security;

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
