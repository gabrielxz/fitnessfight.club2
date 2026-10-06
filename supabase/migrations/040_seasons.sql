-- Season start as data. The current season is the row with the latest starts_on.
-- Points only count for weeks on or after it, and Strava activities that start
-- before it are not stored (lib/season.ts). Competition Reset inserts a new row.

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null unique check (extract(isodow from starts_on) = 1),
  created_at timestamptz not null default now()
);

alter table public.seasons enable row level security;

grant select on public.seasons to authenticated;
grant select, insert, update, delete on public.seasons to service_role;

drop policy if exists seasons_read on public.seasons;
create policy seasons_read on public.seasons
  for select to authenticated using (true);

insert into public.seasons (name, starts_on)
values ('Season 4', '2026-04-06')
on conflict (starts_on) do nothing;
