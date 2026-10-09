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
