update public.workspaces
set color = 'primary'
where color not in ('primary', 'orange', 'red', 'pink', 'violet', 'blue', 'green');

alter table public.workspaces add constraint workspaces_color_known
  check (color in ('primary', 'orange', 'red', 'pink', 'violet', 'blue', 'green'));
