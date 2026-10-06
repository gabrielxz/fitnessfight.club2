# Fitness Fight Club - Technical Documentation

## Project Overview
A web application that syncs with Strava to track exercise data and create custom leaderboards for groups of friends.

**Tagline**: Points. Badges. Flex.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes and Server Actions
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password + Google OAuth)
- **Deployment**: Vercel
- **External APIs**: Strava API (OAuth + Webhooks), Anthropic API (competition update generator)

## Project Structure
```
├── app/
│   ├── admin/
│   │   ├── page.tsx                      # Admin dashboard page
│   │   ├── AdminDashboard.tsx            # Admin UI component
│   │   ├── actions.ts                    # Server actions (deleteUser, assignBadge, removeBadge)
│   │   ├── HabitSummaryGenerator.tsx     # WhatsApp habit challenge update generator
│   │   ├── CompetitionUpdateGenerator.tsx# AI competition update generator
│   │   ├── SummaryParticipantsManager.tsx
│   │   ├── CompetitionResetSection.tsx   # Competition Reset (starts a new season)
│   │   ├── UserDiagnosticsSection.tsx    # Diagnose/fix missing DB entries
│   │   ├── summary-actions.ts
│   │   ├── competition-reset-actions.ts
│   │   └── user-fix-actions.ts
│   ├── api/
│   │   ├── admin/generate-habit-summary/     # Habit challenge update API
│   │   ├── admin/generate-competition-update/# AI competition update API
│   │   ├── badges/                       # Earned badges + badge progress APIs
│   │   ├── cron/
│   │   │   └── weekly-division-shuffle/  # Weekly cron (see Cron section)
│   │   ├── habits/                       # Habit CRUD + entries + history
│   │   ├── leaderboard/                  # Unified leaderboard API
│   │   ├── rivalries/                    # Rivalry periods + matchups API, acknowledge endpoint
│   │   ├── stats/weekly/                 # Weekly activity statistics
│   │   ├── user/profile/                 # Profile read/update (timezone, name, avatar)
│   │   └── strava/
│   │       ├── callback/                 # Strava OAuth callback
│   │       ├── connect/                  # Initiate Strava OAuth
│   │       ├── disconnect/               # Disconnect Strava
│   │       ├── sync/                     # Manual activity sync
│   │       └── webhook/                  # Strava webhook receiver + points calculation
│   ├── auth/
│   │   ├── callback/                     # Supabase OAuth callback
│   │   ├── signout/                      # Sign out handler
│   │   └── auth-code-error/              # OAuth error page
│   ├── components/
│   │   ├── AnimatedBackground.tsx        # Canvas-based particle animation
│   │   ├── Leaderboard.tsx               # Unified leaderboard
│   │   ├── Navigation.tsx                # App navigation with mobile menu
│   │   ├── InstallPrompt.tsx             # PWA install prompt
│   │   ├── TimezoneSettings.tsx          # Profile timezone picker
│   │   ├── habits/                       # Habit tracker UI components
│   │   └── strava-connection.tsx         # Strava connection UI
│   ├── faq/                              # FAQ page (server component + accordion client component)
│   ├── habits/                           # Habit tracker page
│   ├── history/                          # Season history page
│   ├── login/                            # Login/signup page
│   ├── offline/                          # PWA offline page
│   ├── profile/                          # User profile page
│   ├── rivalries/                        # Rivalries page + RivalriesView client component
│   ├── stats/                            # Badge progress page
│   └── page.tsx                          # Home page (unified leaderboard)
├── lib/
│   ├── admin-auth.ts                     # isAdminUser(): admin is decided by verified email only
│   ├── season.ts                         # Current season + season-start floor helpers
│   ├── date-helpers.ts                   # Timezone-aware Monday-Sunday week boundaries
│   ├── points-helpers.ts                 # Exercise points: per-week recalc + reconcile
│   ├── badges/
│   │   └── BadgeCalculator.ts            # Badge calculation logic
│   ├── habits/
│   │   ├── reconcile.ts                  # Habit points reconcile (recompute from entries)
│   │   └── weekly-summary-generator.ts   # Habit challenge WhatsApp message
│   ├── rivalries/
│   │   ├── pairing.ts                    # Greedy rank-adjacent pairing algorithm
│   │   ├── metrics.ts                    # Shared metric computation (9 types)
│   │   └── time-window.ts                # Pacific Time period boundaries + cron gate
│   ├── weekly-update/
│   │   └── generator.ts                  # AI competition update: data fetch + Claude call
│   └── supabase/
│       ├── client.ts                     # Browser client (anon key + user session)
│       ├── server.ts                     # Server client (anon key + user cookie session)
│       ├── admin.ts                      # Admin client (service role, bypasses RLS)
│       └── middleware.ts                 # Session refresh
├── middleware.ts                         # Auth middleware
├── scripts/
│   └── setup-webhook.js                  # Strava webhook subscription management
├── supabase/migrations/                  # Database migrations (run in order)
└── vercel.json                           # Cron job configuration
```

`scripts/backups/` is gitignored and holds local JSON backups of production data taken before one-off cleanups. Never commit it.

## Database Schema

### Data API access model (migration 039)

Every table in `public` has RLS enabled. The anon key is public (it ships in the browser bundle), so the `anon` role has no table or function access at all.

| Role | Access |
|---|---|
| `anon` | Nothing |
| `authenticated` | Own rows on personal tables; read-only on shared reference data (see per-table notes) |
| `service_role` | Everything. Used by the admin client in server routes, cron, webhook, and admin actions |

Rules for app code:
- Any read that spans users (leaderboard, rivalries, admin page, generators) uses `createAdminClient()` after authenticating the caller with the server client, and returns only display fields.
- Any write to points, badges, badge progress, activities, weekly tracking, rivalry data, or seasons uses the admin client.
- The server or browser client is used only for a user's own habits, habit entries, Strava connection, and the identity fields of their profile.
- Functions in `public` (including `increment_*_points`) are executable only by `service_role`. New functions are not executable by client roles unless explicitly granted.

Rules for new migrations:
- After every `CREATE TABLE public.<name>`, enable RLS and add explicit `GRANT`s for each role that needs the table. Supabase stops auto-granting Data API access on new `public` tables from 2026-10-30, so a table without grants returns error `42501` to supabase-js.
- Default to `service_role` only. Add `authenticated` grants and policies only for data a signed-in user reads or manages directly.

### Core Tables
1. **strava_connections**: Strava OAuth tokens and profile
   - Owner has full CRUD on their own row. No cross-user access.

2. **strava_activities**: All Strava activity data
   - Owner can read their own rows. Writes are service role only (webhook and manual sync).
   - Soft delete via `deleted_at`
   - `start_lat`, `start_lng`: activity start coordinates (REAL), saved from Strava `start_latlng`
   - Activities whose local start date is before the current season start are not stored (see Seasons)

3. **strava_webhook_events**: Webhook event log for debugging. Service role only.

4. **user_profiles**: User metadata and cumulative scores
   - `email`, `full_name`, `avatar_url`, `timezone`
   - `home_lat`, `home_lng`: stored home location (REAL), used by the Out of Bounds badge. Set with SQL by the admin; there is no UI or script for it.
   - `cumulative_exercise_points`: Exercise points (1 pt/hr, max 9/week)
   - `cumulative_habit_points`: Habit completion points (0.5 pts per weekly target met)
   - `cumulative_badge_points`: Badge achievement points (3/6/15 for bronze/silver/gold)
   - `total_cumulative_points`: GENERATED column (sum of the three above; never update directly)
   - Owner can read their own row and insert/update only `id, email, full_name, avatar_url, timezone, updated_at` (column-level grants). Points and home location are service role only.

5. **seasons** (migration 040): One row per season
   - `name`, `starts_on` (DATE, must be a Monday, unique), `created_at`
   - The current season is the row with the latest `starts_on`. Seeded with Season 4 (2026-04-06).
   - Signed-in users can read. Writes are service role only (Competition Reset).

### Division System Tables (legacy, unused)
6. **divisions**, **user_divisions**, **division_history**: Season 1 division system. No app code reads or writes them. Service role only.

### Points & Tracking
7. **weekly_exercise_tracking**: Hours logged per user per week (`week_start` is the Monday in the user's timezone). Exercise points are derived from these rows. Owner can read; service role writes.

### Badge System
8. **badges**: Badge definitions with criteria JSON. Signed-in users can read.
9. **user_badges**: Earned badges per user (tier: bronze/silver/gold). Signed-in users can read all rows; service role writes.
10. **badge_progress**: Per-user progress toward each badge. Owner can read; service role writes.

### Habit Tracker
11. **habits**: User habit definitions (name, target_frequency 1-7, position, archived_at). Owner has full CRUD.
12. **habit_entries**: Daily status per habit (SUCCESS/FAILURE/NEUTRAL), with `user_id` and `week_start`. Owner has full CRUD.

### Rivalries
13. **rivalry_periods**: Bi-weekly competition windows
    - `period_number`, `start_date` (Monday), `end_date` (Sunday)
    - `metric`: one of 9 types (see Rivalry Metrics section)
    - `metric_label`, `metric_unit`
    - Signed-in users can read; service role writes

14. **rivalry_matchups**: Player pairings per period
    - `period_id`, `player1_id`, `player2_id`
    - `winner_id`: NULL means tie or still in progress. Resolved matchups are identified by `player1_score IS NOT NULL`.
    - `tie_credit` (BOOLEAN, NOT NULL DEFAULT FALSE): set TRUE on close-out for non-zero ties (winner_id IS NULL AND s1 > 0). Counts as a kill mark for both players. 0-0 ties leave it FALSE.
    - `player1_score`, `player2_score`: scores in display units (km/hrs/m/count); NULL until the period closes out
    - `player1_viewed_at`, `player2_viewed_at`: TIMESTAMPTZ stamped when that player dismisses the result celebration modal; NULL means unacknowledged
    - Each player appears at most once per period
    - Signed-in users can read; service role writes (the acknowledge endpoint uses the admin client after verifying the caller is a participant)

### Weekly Snapshots
15. **leaderboard_snapshots**: Weekly rank + points snapshot per user
    - `user_id`, `week_start` (DATE), `rank` (INTEGER), `total_points` (REAL)
    - Captured at the start of the Monday cron before any processing
    - Used by the AI competition update generator for rank-change tracking
    - Signed-in users can read; service role writes

### Admin
16. **summary_participants**: Habit challenge message participant list. Service role only.

---

## Key Features

### Seasons

The current season start (`lib/season.ts`) is the floor for everything that earns points:
- Habit points: the award path in `app/api/habits/[id]/entries/route.ts` skips pre-season weeks, and the reconcile in `lib/habits/reconcile.ts` only counts entries with `week_start >= starts_on`. Pre-season entries stay in `habit_entries` as history.
- Exercise points: `recalculateAndApplyExercisePointsForWeek` ignores pre-season weeks (no points, no tracking row), and `reconcileExercisePointsForUser` only sums tracking rows with `week_start >= starts_on`.
- Strava ingestion: the webhook and manual sync do not store activities whose local start date is before `starts_on`, so pre-season activities cannot earn points, badges, or rivalry credit.

If the `seasons` read fails or the table is empty, the floor is treated as absent, so a transient error never zeroes anyone's points.

The comparisons are on `YYYY-MM-DD` strings. `week_start` values are the Monday in the user's timezone; all users currently use the `America/New_York` default.

### Leaderboard (`/api/leaderboard`, `app/components/Leaderboard.tsx`)
- Single ranked list
- Top 3 shown as a podium (1ST center, 2ND left, 3RD right)
- Each entry shows: avatar, rank, name, rival name (⚔️ link), score, hours this week, kill marks, badge drawer
- Kill marks (💀): awarded per rivalry win, plus credited (non-zero) ties (both players earn one); each adds 1.5% to the score multiplier
  - `adjusted_points = total_cumulative_points × (1 + kill_marks × 0.015)`
  - The multiplier affects ranking and display
- Clickable score opens a breakdown popout (exercise / habit / badge / kills / total)
- Soft zone tinting for rows 4+: warm orange (top 30%), cool blue (bottom 30%)
- `isAbsoluteUrl()` guard prevents next/image errors from relative Strava avatar URLs
- The route is public (logged-out visitors see the leaderboard). It authenticates the caller with the server client for `current_user_id`, then reads with the admin client.

### Rivalries (`/api/rivalries`, `/rivalries`)
- Bi-weekly 1v1 matchups on a rotating metric (9 types, see Rivalry Metrics section)
- Periods run Monday to Sunday in Pacific Time; the cron closes out the ending period and generates pairings for the next
- Current/History tabs on `/rivalries`:
  - Current: VS hero layout, large avatars, live metric progress bar, winner crown, kill marks
  - History: W/L/T summary counters + per-matchup cards for every closed matchup the user played
- Celebration modal fires on first load after a period closes: W/L/T visual treatments (gold win / muted loss / neutral tie), score recap, and for wins or credited ties a skull tick-up animation. Dismissing POSTs to `/api/rivalries/acknowledge` to stamp `viewed_at` so it never fires twice.
- `SeasonSchedule` shows all periods with a NOW indicator
- Tie semantics: `winner_id` stays NULL on any tie. If both players posted a non-zero score, `tie_credit=TRUE` and both earn a 💀; a 0-0 tie leaves `tie_credit=FALSE` and awards nothing.
- Like the leaderboard, the route authenticates with the server client and reads with the admin client.

### FAQ (`/faq`)
- Accordion sections: Points, Leaderboard, Rivalries, Badges, General
- Explains kill marks, score multiplier, rivalry schedule

### Points System
- **Exercise**: 1 pt/hour, capped at **9 hrs/week**
- **Habits**: 0.5 pts per habit that meets its weekly target; first 5 active habits only (ordered by position, then created_at)
- **Badges**: 3 pts (bronze) / 6 pts (silver) / 15 pts (gold), awarded once per tier
- **Kill marks**: ×(1 + kills × 0.015) multiplier on total, applied at display/ranking time
- Only weeks on or after the current season start earn exercise or habit points (see Seasons)
- Exercise and habit totals are recomputed from source rows every Monday by the cron, which heals drift from the incremental award paths

### Badge System (12 active badge types)

Badge point values: Gold 15 pts / Silver 6 pts / Bronze 3 pts

| Emoji | Name | Type | Criteria | Tiers (B/S/G) |
|---|---|---|---|---|
| 🏔 | Everester | cumulative | Elevation gain (meters, all-time) | 600/2212/4424 |
| 🌍 | Mile Collector | cumulative | Walk/Run/Hike miles (all-time) | 50/100/200 |
| 🐂 | Iron Calves | weekly_cumulative | Bike miles/week | 10/50/90 |
| 🏋️‍♀️ | Meathead | activity_weeks | Weeks with 3+ Weight Training or Crossfit sessions | 1/4/12 |
| 🧘 | Zen Master | weekly_cumulative | Yoga hours/week | 1/4/10 |
| 📸 | Belfie | weekly_count | Weeks with photo attachments | 1/6/12 |
| 🪨 | Rock Solid | habit_weeks | Weeks with 100% habit completion | 1/4/12 |
| 🛑 | No Chill | qualifying_weeks | Weeks with 12+ hours of exercise | 1/6/12 |
| 🕺 | Rhythm Engine | cumulative | Total Dance minutes (all-time) | 60/240/600 |
| 🏅 | Decathlon | unique_sports | Distinct qualifying sports (15 min min, 17-sport list) | 2/4/6 |
| 🎨 | Renaissance | variety_weeks | Weeks with 4+ distinct activity categories | 1/4/12 |
| 🧭 | Out of Bounds | away_hours | Hours exercised 100+ miles from home | 3/10/20 |

**Deactivated** (preserved for history): Tryhard, Stridezilla, Pitch Perfect, Net Gain, Pack Animal

**Home location**: stored in `user_profiles.home_lat` / `home_lng` (REAL). Required for Out of Bounds. New users have none until the admin sets it with SQL.

**Activity categories** (used by Renaissance, 12 categories):
- Run, Walk/Hike, Ride, Strength, Yoga/Flexibility, Water, Winter, Racket Sports, Team/Court Sports, Dance, Cardio/Machine, Adventure

**Badge criteria types**:
- `cumulative`: recalculates total from all activities on each sync
- `weekly_cumulative`: recalculates weekly total each sync; resets each week
- `weekly_count`: counts qualifying weeks (e.g. weeks with photos)
- `weekly_streak`: consecutive weeks with activity
- `qualifying_weeks`: counts weeks meeting a threshold (e.g. 12+ hrs)
- `activity_weeks`: counts weeks with N+ activities of specific types
- `habit_weeks`: counts weeks with 100% habit completion
- `unique_sports`: distinct Strava sport_types logged (optionally from a list, with min time)
- `variety_weeks`: counts weeks with N+ distinct activity categories (mapped via ACTIVITY_CATEGORIES)
- `away_hours`: cumulative hours of activities starting 100+ miles from the user's stored home location
- `single_activity`: best value from a single activity
- `count`: count of activities meeting a condition

### Habit Tracker (`/habits`)
- Add habits with name and target frequency (1-7 days/week)
- Daily tracking: NEUTRAL → SUCCESS → FAILURE cycle
- 0.5 pts per habit meeting its weekly target; only the first 5 habits count
- Weekly cron evaluates habit badges for users with 100% completion
- Soft delete preserves history

### Habit Challenge (between seasons)

A habits-only side competition that runs from `CHALLENGE_START` (2026-09-07, a Monday) with no fixed end date; it ends when the next season launches. Implemented entirely in `lib/habits/weekly-summary-generator.ts` (`generateHabitChallengeSummary`) and surfaced by the admin "Generate Habit Message" button.

- Participants: `summary_participants` rows with `include_in_summary = true`, in `sort_order`.
- Scoring: the app rule. 0.5 points per habit that meets its weekly target, first 5 habits only.
- Points are computed from `habit_entries` with `week_start >= CHALLENGE_START`. `user_profiles.cumulative_habit_points` is not used.
- Past weeks are locked. Each week is scored against the habits that existed during that week (`created_at` on or before the week's Sunday, `archived_at` null or on/after the week's Monday), ordered by `position` then `created_at`, capped at 5. Entries for soft-deleted habits stay in `habit_entries`, so deleting a habit later does not remove points it already earned. `position` is current-only, so reordering can change which five count for past weeks.
- "Current week" is the Monday to Sunday week in `America/New_York`.
- Message blocks: Overall Standings (ranked, ties share a rank), This Week So Far, Last Week (once one exists), Not Tracking Habits.
- The generator takes an optional Supabase client and `now`, which makes it testable with a fake client.
- `CHALLENGE_START` is independent of the `seasons` table. Retire it or move it when the next season launches.

### Authentication Flow
1. Users sign up/log in via Supabase Auth (email or Google)
2. Protected routes redirect to `/login`
3. Session management via middleware
4. Login and the OAuth callback upsert the user's own `user_profiles` row (identity fields only)

### Strava Integration
1. **OAuth Connection**: `/api/strava/connect`
2. **Webhook Processing**: Automatic sync on activity create/update/delete (admin client throughout)
3. **Manual Sync**: "Sync Now" fetches the last 30 activities; authenticates the user, then writes with the admin client scoped to that user
4. **Token Refresh**: Automatic on expiry
5. **Disconnect**: `/api/strava/disconnect`

### Admin Dashboard (`/admin`, Gabriel Beal only)
- Admin is checked with `isAdminUser()` (`lib/admin-auth.ts`), which compares the verified auth email to `gabrielbeal@gmail.com`. Never use `user_metadata` for authorization; users can set it themselves.
- **User Management**: View all users; delete; diagnose/repair missing DB entries
- **Badge Management**: Manually assign/remove bronze/silver/gold badges
- **WhatsApp Competition Update**: AI-generated weekly recap (leaderboard, rank changes, badges, rivalry results, top exercisers); copy-to-clipboard for WhatsApp
- **WhatsApp Habit Summary**: Habit challenge update for the group chat. See Habit Challenge section.
- **Manage Summary Participants**: Control which users appear in the habit challenge update
- **Competition Reset**: Starts a new season. The final step takes a season name and a start date (must be a Monday, not before the current season start). It inserts the `seasons` row first, then deletes user badges, badge progress, Strava activities, weekly exercise tracking, and rivalry matchups, and zeroes all cumulative points. It keeps user accounts, profiles, Strava connections, habits, habit entries, and the rivalry period schedule. Retrying after a partial failure with the same start date reuses the existing season row.

---

## API Endpoints

### Public
- `GET /`: Home page (unified leaderboard)
- `GET /rivalries`: Rivalry matchups page
- `GET /faq`: FAQ page
- `GET /login`: Auth page
- `GET /auth/callback`: OAuth callback
- `GET /api/leaderboard`: Unified leaderboard with kill marks, rivals, badges
- `GET /api/rivalries`: All rivalry periods + current matchups with live stats. For a signed-in caller it also returns `my_history[]` (closed matchups, newest first) and `unacknowledged_result` (most recent closed matchup the user has not yet seen).
- `GET /api/strava/webhook`: Webhook verification
- `POST /api/strava/webhook`: Webhook events

### Protected (requires auth)
- `POST /api/rivalries/acknowledge`: Body `{ matchup_id }`; stamps `player{1,2}_viewed_at` for the caller after verifying they're a participant
- `GET /api/badges`: User's earned badges
- `GET /api/badges/progress`: Badge progress for the current user
- `GET /api/habits`: User's habits + current week
- `POST /api/habits`: Create habit
- `PATCH /api/habits/[id]`: Update habit
- `DELETE /api/habits/[id]`: Soft delete habit
- `POST /api/habits/[id]/entries`: Set daily habit status
- `GET /api/habits/history`: Paginated habit history
- `GET /api/user/profile`, `PATCH /api/user/profile`: Read/update own profile
- `GET /api/strava/connect`: Initiate Strava OAuth
- `GET /api/strava/callback`: Strava OAuth callback
- `POST /api/strava/sync`: Manual sync
- `GET /api/stats/weekly`: Weekly stats
- `GET /profile`: User profile
- `GET /stats`: Badge progress visualization
- `POST /auth/signout`: Sign out

### Admin (Gabriel Beal only)
- `GET /admin`: Admin dashboard
- Server Actions: `deleteUser`, `assignBadge`, `removeBadge`, `resetCompetition`, summary participant and user-fix actions
- `POST /api/admin/generate-habit-summary`: Generate WhatsApp habit challenge update
- `POST /api/admin/generate-competition-update`: Generate AI competition update (requires `ANTHROPIC_API_KEY`)

### Cron (requires `Authorization: Bearer $CRON_SECRET`)
- `GET /api/cron/weekly-division-shuffle`: scheduled in `vercel.json` at 07:05 and 08:05 UTC every Monday. The route runs only during the first hour of Monday in Pacific Time (`isRivalryMondayFirstHour`), so exactly one firing does the work under both PDT and PST and the other returns `{ skipped: true }`. Add `?force=1` to run it manually at any time. Steps in order:
  1. Capture leaderboard snapshot into `leaderboard_snapshots`
  2. Evaluate habit badges for last week for all users with active habits
  3. Reconcile habit points for every user from `habit_entries` (season floor applied)
  4. Reconcile exercise points for every user from `weekly_exercise_tracking` (season floor applied)
  5. Reset weekly badge progress for all weekly badge types
  6. Generate pairings for any rivalry period starting within ±2 days of rivalry-today
  7. Close out ended rivalry periods (compute scores, set winner and tie credit)

  Pairing runs before close-out so the UI never shows the newly-current period with zero matchups during cron execution. Every step is idempotent.

---

## Rivalry System

### Week Boundary (`lib/rivalries/time-window.ts`)

All rivalry date comparisons are anchored to **midnight Pacific Time** using the `America/Los_Angeles` zone, so DST is handled: midnight PT is 07:00 UTC under PDT and 08:00 UTC under PST. ET users get their full Sunday, PT users get theirs, and the UI flip matches cron execution.

Helpers:
- `rivalryTodayStr(now)`: today's date in PT (YYYY-MM-DD). Use it everywhere you would reach for `new Date().toISOString().split('T')[0]` in rivalry code.
- `periodStartUTC(startDate)`: midnight PT on `startDate` as a UTC ISO timestamp. Lower bound for activity queries.
- `periodEndUTC(endDate)`: midnight PT on the day after `endDate`. Upper bound; use with `.lt`, never `.lte`, so Period N's end abuts Period N+1's start. A period that crosses a DST change gets the correct offset at each end.
- `isRivalryMondayFirstHour(now)`: the cron gate described above.

### Pairing Algorithm (`lib/rivalries/pairing.ts`)

`computePairings` runs in the weekly cron when a `rivalry_period.start_date` falls within ±2 days of rivalry-today (PT). It uses a greedy rank-adjacent algorithm:

- **Parameters**: K0=4 (initial window), DELTA=3 (expansion), KMAX=10 (max window), RECENT_AVOIDANCE=2 periods
- **Bye**: If the player count is odd, the lowest-ranked player sits out (no bye history tracking)
- **Window**: One-directional (downward from current rank); expands by DELTA if no unpaired candidate is found
- **Preference order**: (1) never faced, (2) faced but not within the last 2 periods, (3) any (KMAX fallback)
- **Tiebreaker**: Closest rank within preference levels; for the KMAX fallback, least recently faced, then closest rank
- **Idempotency**: Skips if matchups already exist for that period, so it is safe to run multiple times in the window

### Close-out (`app/api/cron/weekly-division-shuffle/route.ts`)

Runs after pairing, every Monday just after midnight PT. Finds periods where `end_date < rivalryToday` with `player1_score IS NULL` (unresolved). For each:
1. Fetches Strava activities in `[periodStartUTC(start_date), periodEndUTC(end_date))`, i.e. midnight PT on start_date to midnight PT on the day after end_date.
2. Computes scores via `computeMetricScores` in display units
3. Sets `player1_score`, `player2_score`, `winner_id` (NULL on any tie), and `tie_credit` (TRUE iff scores are tied and > 0; both players earn a 💀)

`player1_score IS NOT NULL` means the matchup is resolved, which distinguishes ties from pending matchups.

The `lt` comparison matters: a period with `end_date = rivalryToday` is still in progress in PT terms and does not end until rivalryToday passes it.

### Rivalry Metrics (`lib/rivalries/metrics.ts`)

Shared helper used by both the cron close-out and the live `/api/rivalries` display.

| Metric key | Label | Query | Unit | Sport filter |
|---|---|---|---|---|
| `total_distance` | All-Purpose Distance | SUM(distance) | km | All |
| `run_distance` | Run & Walk Distance | SUM(distance) | km | Run, VirtualRun, TrailRun, Walk, Hike, Snowshoe |
| `moving_time` | Hours Exercised | SUM(moving_time) | hrs | All |
| `elevation_gain` | Elevation Climbed | SUM(total_elevation_gain) | m | All |
| `unique_activity_types` | Variety Week | COUNT(DISTINCT sport_type) | types | All |
| `strength_days` | Strength Days | COUNT(DISTINCT local date) where moving_time ≥ 15 min | days | WeightTraining, Workout, Crossfit, HighIntensityIntervalTraining, Pilates |
| `active_days` | Active Days | COUNT(DISTINCT local date) | days | All |
| `yoga_time` | Yoga Week | SUM(moving_time) | hrs | Yoga |
| `dance_time` | Dance Week | SUM(moving_time) | hrs | Dance |

Day-based metrics group by the activity's own `start_date_local`, independent of the PT period boundary.

### Season 4 Schedule (Apr 6 to Aug 23, 2026)

| Period | Dates | Metric |
|---|---|---|
| 1 | Apr 6 to Apr 19 | All-Purpose Distance |
| 2 | Apr 20 to May 3 | Run & Walk Distance |
| 3 | May 4 to May 17 | Strength Days |
| 4 | May 18 to May 31 | Hours Exercised |
| 5 | Jun 1 to Jun 14 | Active Days |
| 6 | Jun 15 to Jun 28 | Elevation Climbed |
| 7 | Jun 29 to Jul 12 | Variety Week |
| 8 | Jul 13 to Jul 26 | Yoga Week |
| 9 | Jul 27 to Aug 9 | Dance Week |
| 10 | Aug 10 to Aug 23 | Run & Walk Distance |

Dates are Monday to Sunday in Pacific Time; see Week Boundary above for the exact UTC cutoffs. The next season's periods are not defined yet; they are inserted into `rivalry_periods` with SQL.

### Rivalry Admin Operations (Manual SQL)

**Create matchups manually:**
```sql
INSERT INTO rivalry_matchups (period_id, player1_id, player2_id)
VALUES
  ('period-uuid'::uuid, 'user1-uuid'::uuid, 'user2-uuid'::uuid),
  ('period-uuid'::uuid, 'user3-uuid'::uuid, 'user4-uuid'::uuid);
```

**Manually resolve a matchup (override close-out):**
```sql
UPDATE rivalry_matchups
SET winner_id = 'winner-uuid'::uuid,
    player1_score = 42.3,
    player2_score = 38.1
WHERE id = 'matchup-uuid'::uuid;
```

---

## Database Migrations (run in order)

Migrations are applied by pasting them into the Supabase SQL editor. Some early numbers are missing or duplicated; production has also drifted from the early files, which is why migration 039 drops and recreates every policy instead of editing them.

| # | File | Description |
|---|------|-------------|
| 001 | create_strava_connections.sql | Strava OAuth connections |
| 002 | create_strava_activities.sql | Activity storage |
| 003 | create_divisions.sql | Division system (legacy) |
| 004 | create_badges.sql | Badge system |
| 005 | admin_policies.sql | Admin RLS policies (superseded by 039) |
| 006 | create_user_profiles.sql | User profiles |
| 007 | add_weekly_badge_support.sql | Periodic badge support |
| 008 | create_habits.sql | Habit tracker |
| 010 | add_timezone_to_profiles.sql | Timezone support |
| 011 | add_cumulative_points.sql | Enhanced cumulative points |
| 012 | refactor_user_points.sql | Split points columns |
| 013 | add_increment_badge_points_fn.sql | Badge points function |
| 014 | add_user_id_to_habit_entries.sql | Habit entries user_id |
| 016 | disable_rls_habit_summaries.sql, fix_habit_summaries_rls.sql | Habit summaries (table no longer exists) |
| 017 | reset_badges_add_dates.sql | Badge date fields |
| 018 | add_suffer_score.sql | Relative Effort tracking |
| 019-021 | fix_expires_at_column, fix_badge_progress_columns, add_foreign_key_user_profiles | Fixes |
| 022 | cumulative_points_system.sql | Drop user_points; cumulative scoring; increment_* functions |
| 023-024 | fix_weekly_tracking_rls, fix_badge_progress_constraint | Fixes |
| 025-027 | summary_participants migrations | Habit summary participants |
| 026 | create_rivalries.sql | Rivalry periods + matchups |
| 028 | grant_admin_permissions.sql | Policies (superseded by 039) |
| 029 | update_rivalry_metrics.sql | Expand metric CHECK to 9 types; player scores; Season 4 schedule |
| 030 | rhythm_engine_badge.sql | Deactivate Stridezilla; add Rhythm Engine |
| 031 | badge_season4_updates.sql | Deactivate Pitch Perfect + Net Gain; rework No Chill; add Decathlon |
| 032 | renaissance_badge.sql | Deactivate Pack Animal; add Renaissance |
| 033 | add_home_location.sql | home_lat/home_lng on user_profiles (file not in repo; applied directly) |
| 034 | out_of_bounds_badge.sql | start_lat/start_lng on strava_activities; Out of Bounds badge |
| 035 | leaderboard_snapshots.sql | leaderboard_snapshots table |
| 036 | rivalry_result_acknowledgement.sql | `player1_viewed_at`/`player2_viewed_at` on rivalry_matchups |
| 037 | strength_days_metric.sql | `strength_days` metric replaces `strength_count` |
| 038 | rivalry_tie_credit.sql | `tie_credit` on rivalry_matchups |
| 039 | lock_down_rls.sql | RLS on every table, all policies recreated, client roles stripped, function EXECUTE restricted to service_role (see Data API access model) |
| 040 | seasons.sql | `seasons` table, seeded with Season 4 |

---

## Environment Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]  # Required for every cross-user read and all point/badge writes

# Strava OAuth
STRAVA_CLIENT_ID=[client-id]
STRAVA_CLIENT_SECRET=[client-secret]
STRAVA_WEBHOOK_VERIFY_TOKEN=[random-string]
STRAVA_REDIRECT_BASE_URL=[production-url]   # e.g. https://fitnessfight.club

# Cron Job Security
CRON_SECRET=[secure-random-token]

# AI (competition update generator)
ANTHROPIC_API_KEY=[anthropic-api-key]
```

---

## Deployment

### Vercel
- Auto-deploys from the GitHub `main` branch
- Environment variables are set in the Vercel dashboard
- **Cron Jobs**: two Monday entries for the weekly cron (07:05 and 08:05 UTC); see the Cron section

### Strava Webhook Setup
```bash
node scripts/setup-webhook.js view    # View current subscription
node scripts/setup-webhook.js create  # Create new subscription
node scripts/setup-webhook.js delete  # Delete existing subscription
```

### Strava API base URL
Strava is moving the API base from `https://www.strava.com/api/v3` to `https://www.api-v3.strava.com` (deadline 2027-06-01). Two call sites carry `TODO(strava-api-v3-migration)` comments. Switch only after the new host resolves in DNS. OAuth endpoints are not part of the move.

---

## Development Workflow

### Local Development
```bash
npm run dev   # http://localhost:3000
# Uses the same Supabase cloud database as production
```

### Checks
```bash
npx tsc --noEmit
npm run build
```
`npm run lint` currently crashes inside `@eslint/eslintrc` while loading `eslint-config-next` (circular config structure); the config needs migrating to the flat format that eslint-config-next 16 exports.

Test accounts are not stored in this repo.

---

## Known Issues & Solutions

### 1. Strava Relative Avatar URLs
**Issue**: Some Strava profiles return relative URLs (e.g. `avatar/athlete/medium.png`) which break `next/image`
**Solution**: `isAbsoluteUrl()` validator in `Leaderboard.tsx` and `RivalriesView.tsx` falls back to an initials avatar

### 2. Timezone Handling
All APIs fetch the timezone from `user_profiles.timezone`, defaulting to `America/New_York`. The webhook uses `start_date` (UTC) to place activities in weeks. Habit entry dates are parsed with `T12:00:00` appended to avoid off-by-one-day errors.

### 3. iOS Auth + OAuth
- Logout: client-side Supabase sign-out + hard redirect (avoids service worker caching)
- Strava Connect: `window.location.href` hard navigation instead of Next.js `<Link>`

### 4. Complete User Deletion
Requires `SUPABASE_SERVICE_ROLE_KEY`. Deletes from: auth.users, strava_activities, strava_connections, user_profiles, user_divisions, division_history, user_badges, weekly_exercise_tracking, habit_entries, habits.

### 5. Webhook POST is unauthenticated
Strava does not sign webhook deliveries, so `POST /api/strava/webhook` accepts any caller. It only acts on activities fetched from Strava with the stored token of the matching athlete, and deletes are scoped to that athlete's user. Registering the callback URL with a secret query parameter would close this; not done yet.

---

## Completed Seasons

- ✅ **Season 1**: Division system (Noodle → Sweaty → Shreddy → Juicy), weekly promotions/relegations
- ✅ **Season 2**: UI redesign: dark theme, glassmorphism, animated background
- ✅ **Season 3**: Badge system (7 badge types, 3 tiers), habit tracker, cumulative points
  - Champion: Brian Clonaris
- ✅ **Season 4** (Apr 6 to Aug 23, 2026): Unified leaderboard, rivalries with kill marks (💀), podium top-3 treatment, score breakdown popout, FAQ page

---

## Agent Update Log

### Claude Opus 5.5 (2026-10-06): Data API lockdown, seasons, DST-aware rivalries, cleanup

**Objective**: Respond to Supabase's `rls_disabled_in_public` alert, add a real season start, make rivalry boundaries DST-aware, and clear out one-off scripts.

**Found**: with the public anon key, anyone could read every row of strava_connections (OAuth access and refresh tokens), user_profiles (emails, home coordinates), strava_activities, and strava_webhook_events, and could execute `increment_exercise_points` / `increment_habit_points` for any user. Signed-in users could write their own points, badges, and weekly tracking rows. Several admin gates (including `deleteUser`) accepted `user_metadata.full_name === 'Gabriel Beal'`, which any user can set.

**Changes**:
- Migration 039 (`lock_down_rls.sql`): see Data API access model.
- Cross-user reads (`/api/leaderboard`, `/api/rivalries`, `/admin`) and all manual-sync writes moved to the admin client.
- `lib/admin-auth.ts`: email-only admin check used by every admin gate.
- Migration 040 + `lib/season.ts`: season floor on habit and exercise points (award paths and reconciles) and on Strava ingestion. Competition Reset takes a season name and start Monday, inserts the season first, and no longer deletes habit entries.
- `lib/rivalries/time-window.ts`: `America/Los_Angeles` via date-fns-tz. The cron runs at 07:05 and 08:05 UTC and gates itself to the first hour of Monday PT.
- Webhook deletes scoped to the athlete's user.
- Removed: legacy division code (`/api/divisions`, LoggedInView, DivisionLeaderboard, DivisionSelector, WeekProgress, AthleteCard, BadgeDisplay, division assignment in login/callback/sync), 85 one-off scripts, root test scripts, `@playwright/test`, test credentials from this file.

**Verified**: `tsc --noEmit` and `npm run build` pass; time-window helpers checked against PDT, PST, and a period spanning the 2026-11-01 DST change, plus the cron gate at each firing time.

### Claude Fable 5.1 (2026-09-07): Habit Challenge Update Generator

**Objective**: Repurpose the admin "WhatsApp Habit Summary" button for a habits-only side challenge starting 2026-09-07 with no fixed end date.

**Changes**:
- `lib/habits/weekly-summary-generator.ts`: rewritten. `generateHabitChallengeSummary(supabase?, now?)` replaces `generateHabitSummary(weekOffset)`. Computes points from `habit_entries` since `CHALLENGE_START`, scoring each week against the habits that existed during that week (first 5 by position). Three message blocks: overall standings, this week so far, last completed week.
- `app/api/admin/generate-habit-summary/route.ts`: no longer reads `weekOffset`.
- `app/admin/HabitSummaryGenerator.tsx`: heading and description updated; no request body.

**Verified**: `tsc --noEmit` clean; generator run against prod for real `now` and a synthetic date two weeks in; a fake-client test covering pre-challenge entries ignored, archived habit locked for earlier weeks, first-5 cap, sixth habit promoted after a deletion, mid-week habit creation, tie ranking, excluded participants.

### Claude (2026-07-01): Habit and exercise points reconciliation

**Changes**:
- `lib/habits/reconcile.ts` and `reconcileExercisePointsForUser` in `lib/points-helpers.ts`: idempotent recomputes from source rows, wired into the weekly cron.
- One-off cleanup on prod: 440 pre-season habit entries deleted (backup in `scripts/backups/`), all 19 users reconciled for habit and exercise points.

### Claude Opus 4.7 (2026-04-21): Rivalry Results UI: History Tab + Celebration Modal

**Changes**:
- Migration 036: nullable `player1_viewed_at` / `player2_viewed_at` on `rivalry_matchups`, backfilled for already-closed matchups.
- `/api/rivalries`: returns `my_history[]` and `unacknowledged_result` for the signed-in user.
- `POST /api/rivalries/acknowledge`: verifies the caller is a participant, then stamps their `viewed_at` via the admin client.
- `app/rivalries/RivalriesView.tsx`: Current / History tabs, `HistoryList` / `HistoryRow`, and `CelebrationModal` with per-outcome styling and a skull tick-up animation.

### Claude Opus 4.7 (2026-04-20): Rivalry Week Boundary Anchored to Midnight PT

**Changes**:
- `lib/rivalries/time-window.ts`: PT-anchored helpers.
- Cron moved to just after midnight PT; pairing runs before close-out; close-out uses `end_date < rivalryToday`.
- Activity filters use `[periodStartUTC, periodEndUTC)`.
- Three pre-season test periods deleted and the rest renumbered 1 to 10.

**Transition wart**: Period 1 was closed out under the old UTC rules, so activities between Apr 19 23:59:59 UTC and Apr 20 07:00 UTC were not counted for it. No backfill was run.

### Claude Sonnet 4.6 (2026-03-20): AI Competition Update Generator + Badge/FAQ Cleanup

**Changes**:
- `lib/weekly-update/generator.ts`, `app/api/admin/generate-competition-update/route.ts`, `app/admin/CompetitionUpdateGenerator.tsx`: WhatsApp competition update written by Claude from leaderboard, rank changes, badges, rivalry results, and top exercisers.
- Migration 035: `leaderboard_snapshots`, captured at the start of each weekly cron run.
- Admin dashboard division UI removed.
- Competition Reset deletes `rivalry_matchups` and keeps `rivalry_periods`.
- FAQ: one accordion item per badge; added the "updated an activity but the app didn't pick it up" item (change the title on Strava to force a re-sync).

### Claude Sonnet 4.6 (2026-03-19): Badge System Overhaul + Out of Bounds

**Changes**:
- New criteria types in `BadgeCalculator.ts`: `qualifying_weeks`, `variety_weeks`, `away_hours`.
- New badges: No Chill (reworked), Rhythm Engine, Decathlon, Renaissance, Out of Bounds. Deactivated: Stridezilla, Pitch Perfect, Net Gain, Pack Animal.
- Migrations 033/034: home location on profiles, start coordinates on activities. Home locations were set for 17 users.

### Claude Sonnet 4.6 (2026-03-04): Rivalry System: Pairing, Close-out, Metrics

**Changes**:
- `lib/rivalries/pairing.ts` and `lib/rivalries/metrics.ts`.
- Cron close-out and pairing; fixes for `user_id` vs `id` and multiple-row lookups.
- Migration 029: 9-metric CHECK constraint, player scores, period metric assignments.

### Claude Sonnet 4.6 (2026-02-26): Season 4 Redesign

**Changes**:
- Divisions removed from the leaderboard; single `Leaderboard.tsx` with podium, score breakdown, and kill marks.
- New `/api/leaderboard`, `/api/rivalries`, `/rivalries`, `/faq`.
- Migration 026: rivalry tables.

### Earlier (2025)
- Codex CLI (2025-09-17): timezone-aware weekly hours, unified manual sync with the webhook flow, weekly badge reset filter fix, iOS logout and Strava connect fixes, `/api/strava/disconnect`, `STRAVA_REDIRECT_BASE_URL`.
- Gemini (2025-09-12): migration 022, cumulative points columns, `weekly_exercise_tracking`, `increment_*_points` RPCs.
- Gemini (2025-09-10): `lib/date-helpers.ts`, `lib/points-helpers.ts`, `total_cumulative_points` as a generated column.
