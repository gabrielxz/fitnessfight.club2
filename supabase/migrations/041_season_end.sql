-- Season end. ends_on is the last Sunday of the season; null while it is open.
-- Weeks after ends_on do not earn points or badges (lib/season.ts). Competition
-- Reset closes the current season on the Sunday before the next one starts.

alter table public.seasons
  add column if not exists ends_on date;

alter table public.seasons
  drop constraint if exists seasons_ends_on_check;
alter table public.seasons
  add constraint seasons_ends_on_check
  check (ends_on is null or (extract(isodow from ends_on) = 7 and ends_on > starts_on));

-- Season 4 ran Apr 6 to Aug 23, 2026. The next weekly reconcile drops points
-- from off-season weeks, returning exercise and habit totals to their final
-- Season 4 values.
update public.seasons
set ends_on = '2026-08-23'
where starts_on = '2026-04-06' and ends_on is null;
