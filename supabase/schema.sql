create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Personnel' check (length(trim(name)) > 0),
  color text not null default 'primary' constraint workspaces_color_known check (color in ('primary', 'orange', 'red', 'pink', 'violet', 'blue', 'green')),
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

-- Plans are the single source of truth for limits; null means unlimited.
create table public.plans (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  per_user boolean not null default false,
  max_boards integer check (max_boards is null or max_boards >= 0),
  max_storage_bytes bigint check (max_storage_bytes is null or max_storage_bytes >= 0),
  is_public boolean not null default true,
  sort_order integer not null default 0
);

alter table public.plans enable row level security;

create policy "Anyone can read plans"
  on public.plans for select
  using (true);

insert into public.plans (id, name, monthly_price_cents, per_user, max_boards, max_storage_bytes, is_public, sort_order) values
  ('free', 'Free', 0, false, 3, 500 * 1024 * 1024, true, 0),
  ('pro', 'Pro', 500, false, null, 10::bigint * 1024 * 1024 * 1024, true, 1),
  -- Hidden until workspace sharing ships.
  ('team', 'Team', 800, true, null, 10::bigint * 1024 * 1024 * 1024, false, 2);

-- Written by the payment webhooks (service role) only.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Clients can read their subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- One row per uploaded image, written by the media worker (service role).
create table public.media_objects (
  storage_path text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index media_objects_user_idx on public.media_objects (user_id);

alter table public.media_objects enable row level security;

create policy "Clients can read their media objects"
  on public.media_objects for select
  using (auth.uid() = user_id);

create function public.user_plan_id(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select plan_id from public.subscriptions
     where user_id = target_user_id and status in ('active', 'past_due')),
    'free'
  );
$$;

revoke execute on function public.user_plan_id(uuid) from public, anon, authenticated;

create function public.user_board_count(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.boards
  join public.workspaces on workspaces.id = boards.workspace_id
  where workspaces.owner_id = target_user_id;
$$;

revoke execute on function public.user_board_count(uuid) from public, anon, authenticated;

create function public.account_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan_id', plans.id,
    'plan_name', plans.name,
    'boards', public.user_board_count(auth.uid()),
    'max_boards', plans.max_boards,
    'storage_bytes', coalesce((select sum(size_bytes) from public.media_objects where user_id = auth.uid()), 0),
    'max_storage_bytes', plans.max_storage_bytes
  )
  from public.plans
  where plans.id = public.user_plan_id(auth.uid()) and auth.uid() is not null;
$$;

revoke execute on function public.account_usage() from public, anon;
grant execute on function public.account_usage() to authenticated;

create function public.enforce_board_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  limit_boards integer;
begin
  select owner_id into owner from public.workspaces where id = new.workspace_id;
  if owner is null then
    return new;
  end if;
  -- Serialize concurrent creations for the same account.
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  select max_boards into limit_boards from public.plans where id = public.user_plan_id(owner);
  if limit_boards is not null and public.user_board_count(owner) >= limit_boards then
    raise exception 'Limite de % boards atteinte pour votre plan.', limit_boards
      using errcode = 'P0001', hint = 'quota_boards';
  end if;
  return new;
end;
$$;

create trigger boards_enforce_quota
before insert on public.boards
for each row execute function public.enforce_board_quota();
