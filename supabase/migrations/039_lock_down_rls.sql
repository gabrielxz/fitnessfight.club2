-- Lock down the Data API.
--
-- Before this migration the public anon key (shipped in the browser bundle) could
-- read every row of strava_connections (OAuth access + refresh tokens),
-- user_profiles (emails, home coordinates), strava_activities (GPS polylines),
-- and strava_webhook_events, and could execute increment_*_points for any user.
-- Several tables also allowed signed-in users to write their own points,
-- badges, and weekly tracking rows directly.
--
-- Access model after this migration:
--   anon           nothing
--   authenticated  own rows on personal tables; read-only on shared reference data
--   service_role   everything (server routes, cron, webhook, admin actions)
--
-- Every app route that reads across users or writes points, badges, activities,
-- or tracking rows uses the service-role client, so it is unaffected by RLS.
--
-- The migration drops every existing policy in the public schema and recreates
-- the intended set, so the end state does not depend on drift between the
-- migration files and production. Deploy the matching app code first.

begin;

-- 1. RLS on everywhere, all existing policies dropped, client roles stripped.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on public.%I from anon, authenticated', r.tablename);
    execute format('grant select, insert, update, delete on public.%I to service_role', r.tablename);
  end loop;

  -- Views run with their owner's privileges and bypass RLS, so client roles get none.
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- 2. Shared reference data: any signed-in user can read.
grant select on public.badges to authenticated;
create policy badges_read on public.badges
  for select to authenticated using (true);

grant select on public.user_badges to authenticated;
create policy user_badges_read on public.user_badges
  for select to authenticated using (true);

grant select on public.rivalry_periods to authenticated;
create policy rivalry_periods_read on public.rivalry_periods
  for select to authenticated using (true);

grant select on public.rivalry_matchups to authenticated;
create policy rivalry_matchups_read on public.rivalry_matchups
  for select to authenticated using (true);

grant select on public.leaderboard_snapshots to authenticated;
create policy leaderboard_snapshots_read on public.leaderboard_snapshots
  for select to authenticated using (true);

-- 3. Personal data the server computes: owner can read, only the service role writes.
grant select on public.strava_activities to authenticated;
create policy strava_activities_own_read on public.strava_activities
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.weekly_exercise_tracking to authenticated;
create policy weekly_exercise_tracking_own_read on public.weekly_exercise_tracking
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.badge_progress to authenticated;
create policy badge_progress_own_read on public.badge_progress
  for select to authenticated using (user_id = (select auth.uid()));

-- 4. user_profiles: owner can read and edit identity fields only. Point totals
--    and home location are writable by the service role alone.
grant select on public.user_profiles to authenticated;
grant insert (id, email, full_name, avatar_url, timezone, updated_at) on public.user_profiles to authenticated;
grant update (id, email, full_name, avatar_url, timezone, updated_at) on public.user_profiles to authenticated;
create policy user_profiles_own_read on public.user_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy user_profiles_own_insert on public.user_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_own_update on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 5. Data the user manages directly: owner has full CRUD on their own rows.
grant select, insert, update, delete on public.strava_connections to authenticated;
create policy strava_connections_own on public.strava_connections
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.habits to authenticated;
create policy habits_own on public.habits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- habit_entries has no user_id in production (migration 014 was never applied),
-- so ownership goes through the parent habit.
grant select, insert, update, delete on public.habit_entries to authenticated;
create policy habit_entries_own on public.habit_entries
  for all to authenticated
  using (exists (
    select 1 from public.habits h
    where h.id = habit_entries.habit_id and h.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.habits h
    where h.id = habit_entries.habit_id and h.user_id = (select auth.uid())
  ));

-- seasons is created by migration 040; this keeps a re-run of 039 from
-- dropping its read policy.
do $$
begin
  if to_regclass('public.seasons') is not null then
    grant select on public.seasons to authenticated;
    create policy seasons_read on public.seasons for select to authenticated using (true);
  end if;
end $$;

-- 6. Service-role only, no client grants or policies: strava_webhook_events,
--    summary_participants, divisions, user_divisions, division_history, and any
--    other table in public not listed above.

-- 7. Functions: client roles cannot execute anything in public. Trigger
--    functions are skipped because triggers do not check EXECUTE when they fire.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- New functions in public are not executable by client roles unless granted.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verify (expected: rls = true on every row, anon_select = false everywhere):
-- select c.relname, c.relrowsecurity as rls,
--        has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
--        has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
--        has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- order by c.relname;
