alter table public.boards add column archived_at timestamptz;

update public.boards set name = 'Mon board' where length(trim(name)) = 0;

alter table public.boards add constraint boards_name_not_blank check (length(trim(name)) > 0);
