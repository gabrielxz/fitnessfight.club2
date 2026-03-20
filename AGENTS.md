# Fitness Fight Club - Technical Documentation

## Project Overview
A web application that syncs with Strava to track exercise data and create custom leaderboards for groups of friends.

**Tagline**: Points. Badges. Flex.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password + Google OAuth)
- **Deployment**: Vercel
- **External APIs**: Strava API (OAuth + Webhooks)

## Project Structure
```
├── app/
│   ├── admin/
│   │   ├── page.tsx                      # Admin dashboard page
│   │   ├── AdminDashboard.tsx            # Admin UI component
│   │   ├── actions.ts                    # Server actions (deleteUser, assignBadge)
│   │   ├── HabitSummaryGenerator.tsx     # WhatsApp habit summary generator
│   │   ├── CompetitionUpdateGenerator.tsx# AI competition update generator
│   │   ├── SummaryParticipantsManager.tsx
│   │   ├── CompetitionResetSection.tsx   # Nuclear reset button
│   │   ├── UserDiagnosticsSection.tsx    # Diagnose/fix missing DB entries
│   │   ├── summary-actions.ts
│   │   ├── competition-reset-actions.ts
│   │   └── user-fix-actions.ts
│   ├── api/
│   │   ├── admin/generate-habit-summary/     # Habit summary API
│   │   ├── admin/generate-competition-update/# AI competition update API
│   │   ├── badges/progress/              # Badge progress API
│   │   ├── cron/
│   │   │   └── weekly-division-shuffle/  # Weekly cron: leaderboard snapshot, habit badges, badge resets, rivalry close-out + pairing
│   │   ├── habits/                       # Habit CRUD + entries
│   │   ├── leaderboard/                  # Unified leaderboard API (Season 4)
│   │   ├── rivalries/                    # Rivalry periods + matchups API (Season 4)
│   │   ├── stats/weekly/                 # Weekly activity statistics
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
│   │   ├── Leaderboard.tsx               # Unified leaderboard (Season 4)
│   │   ├── Navigation.tsx                # App navigation with mobile menu
│   │   ├── InstallPrompt.tsx             # PWA install prompt
│   │   └── strava-connection.tsx         # Strava connection UI
│   ├── faq/
│   │   ├── page.tsx                      # FAQ server component (Season 4)
│   │   └── FAQContent.tsx                # FAQ accordion client component
│   ├── habits/                           # Habit tracker pages
│   ├── history/                          # Season history page
│   ├── login/                            # Login/signup page
│   ├── profile/                          # User profile page
│   ├── rivalries/
│   │   ├── page.tsx                      # Rivalries server component (Season 4)
│   │   └── RivalriesView.tsx             # Rivalries UI client component
│   ├── stats/                            # Stats page
│   │   ├── page.tsx
│   │   └── BadgeProgressDisplay.tsx
│   └── page.tsx                          # Home page (unified leaderboard)
├── lib/
│   ├── badges/
│   │   └── BadgeCalculator.ts            # Badge calculation logic
│   ├── rivalries/
│   │   ├── pairing.ts                    # Greedy rank-adjacent pairing algorithm
│   │   └── metrics.ts                    # Shared metric computation (9 types)
│   ├── weekly-update/
│   │   └── generator.ts                  # AI competition update: data fetch + Claude Sonnet call
│   └── supabase/
│       ├── client.ts                     # Browser client
│       ├── server.ts                     # Server client
│       ├── admin.ts                      # Admin client (service role)
│       └── middleware.ts                 # Session refresh
├── middleware.ts                         # Auth middleware
├── scripts/
│   └── setup-webhook.js                  # Strava webhook management
├── supabase/migrations/                  # Database migrations (run in order)
└── vercel.json                           # Cron job configuration
```

## Database Schema

### Core Tables
1. **strava_connections** - Strava OAuth tokens and profile
   - RLS: Public read (for webhooks), user-controlled write

2. **strava_activities** - All Strava activity data
   - RLS: **DISABLED** (webhooks need to insert without auth)
   - Soft delete via `deleted_at`
   - `start_lat`, `start_lng` — activity start coordinates (REAL); saved from Strava `start_latlng`; backfilled from polylines for existing data

3. **strava_webhook_events** - Webhook event log for debugging

4. **user_profiles** - User metadata and cumulative scores
   - `email`, `full_name`, `avatar_url`, `timezone`
   - `home_lat`, `home_lng` — stored home location (REAL); set via admin script; used by Out of Bounds badge
   - `cumulative_exercise_points` - Exercise points (1 pt/hr, max 9/week)
   - `cumulative_habit_points` - Habit completion points (0.5 pts per weekly target met)
   - `cumulative_badge_points` - Badge achievement points (3/6/15 for bronze/silver/gold)
   - `total_cumulative_points` - GENERATED column (auto-sum of above three)

### Division System Tables (Legacy — not used in Season 4 UI)
5. **divisions** - Division definitions (Noodle, Sweaty, Shreddy, Juicy)
6. **user_divisions** - Current division assignments
7. **division_history** - Promotion/relegation history

### Points & Tracking
8. **weekly_exercise_tracking** - Weekly exercise hours and cap enforcement
   - Tracks hours logged per week; enforces the weekly exercise point cap

### Badge System
9. **badges** - Badge definitions with criteria JSON
10. **user_badges** - Earned badges per user (with tier: bronze/silver/gold)
11. **badge_progress** - Per-user progress toward each badge

### Habit Tracker
12. **habits** - User habit definitions (name, target_frequency 1-7, position, archived_at)
13. **habit_entries** - Daily status per habit (SUCCESS/FAILURE/NEUTRAL)

### Season 4: Rivalries
14. **rivalry_periods** - Bi-weekly competition windows
    - `period_number`, `start_date` (Monday), `end_date` (Sunday)
    - `metric` — one of 9 types (see Rivalry Metrics section)
    - `metric_label`, `metric_unit`
    - RLS: public read, admin write only

15. **rivalry_matchups** - Player pairings per period
    - `period_id`, `player1_id`, `player2_id`
    - `winner_id` — NULL means tie or still in progress; resolved matchups are identified by `player1_score IS NOT NULL`
    - `player1_score`, `player2_score` — scores in display units (km/hrs/m/count); NULL until period closes out
    - Each player appears at most once per period
    - RLS: public read, admin write only

### Season 4: Weekly Snapshots
16. **leaderboard_snapshots** - Weekly rank + points snapshot per user
    - `user_id`, `week_start` (DATE), `rank` (INTEGER), `total_points` (REAL)
    - Captured at the start of the Sunday cron before any processing
    - Used by the AI competition update generator for rank-change tracking
    - RLS: public read, service role write

### Admin
17. **summary_participants** - WhatsApp summary participant list

---

## Key Features

### Season 4: Unified Leaderboard + Rivalries (Current)

**Leaderboard** (`/api/leaderboard`, `app/components/Leaderboard.tsx`):
- Single ranked list — no divisions
- Top 3 shown as a podium (1ST center, 2ND left, 3RD right)
- Each entry shows: avatar, rank, name, rival name (⚔️ link), score, hours this week, kill marks, badge drawer
- Kill marks (💀): awarded per rivalry win; each adds 1% to your score multiplier
  - `adjusted_points = total_cumulative_points × (1 + kill_marks × 0.01)`
  - Kill mark multiplier affects ranking AND display
- Clickable score → breakdown popout (exercise / habit / badge / kills / total)
- Soft zone tinting for rows 4+: warm orange (top 30%), cool blue (bottom 30%)
- `isAbsoluteUrl()` guard prevents next/image errors from relative Strava avatar URLs

**Rivalries** (`/api/rivalries`, `/rivalries`):
- Bi-weekly 1v1 matchups on a rotating metric (9 types — see Rivalry Metrics section)
- Periods run Monday–Sunday; cron closes out the ending period then generates pairings for the next
- VS hero layout: large avatars, live metric progress bar, winner crown, kill marks
- `SeasonSchedule` shows all periods with NOW indicator
- Tie (including 0-0) = no kill mark for either player; `winner_id` stays NULL

**FAQ** (`/faq`):
- Accordion sections: Points, Leaderboard, Rivalries, Badges, General
- Explains kill marks, score multiplier, rivalry schedule

### Points System
- **Exercise**: 1 pt/hour, capped at **9 hrs/week** (lowered from 10 in Season 4)
- **Habits**: 0.5 pts per habit that meets its weekly target; first 5 habits only
- **Badges**: 3 pts (bronze) / 6 pts (silver) / 15 pts (gold), awarded once per tier
- **Kill marks**: ×(1 + kills × 0.01) multiplier on total, applied at display/ranking time

### Badge System (10 active badge types — Season 4)

Badge point values: Gold 15 pts / Silver 6 pts / Bronze 3 pts

| Emoji | Name | Type | Criteria | Tiers (B/S/G) |
|---|---|---|---|---|
| 🏔 | Everester | cumulative | Elevation gain (meters, all-time) | 600/2212/4424 |
| 🐂 | Iron Calves | weekly_cumulative | Bike miles/week | 10/50/90 |
| 🧘 | Zen Master | weekly_cumulative | Yoga hours/week | 1/4/10 |
| 📸 | Belfie | weekly_count | Weeks with photo attachments | 1/6/12 |
| 🪨 | Rock Solid | habit_weeks | Weeks with 100% habit completion | 1/4/12 |
| 🛑 | No Chill | qualifying_weeks | Weeks with 12+ hours of exercise | 1/6/12 |
| 🕺 | Rhythm Engine | cumulative | Total Dance minutes (all-time) | 60/240/600 |
| 🏅 | Decathlon | unique_sports | Distinct qualifying sports (15 min min, 17-sport list) | 2/4/6 |
| 🎨 | Renaissance | variety_weeks | Weeks with 4+ distinct activity categories | 1/4/12 |
| 🧭 | Out of Bounds | away_hours | Hours exercised 100+ miles from home | 3/10/20 |

**Deactivated** (preserved for history): Tryhard, Stridezilla, Pitch Perfect, Net Gain, Pack Animal

**Home location**: stored in `user_profiles.home_lat` / `home_lng` (REAL). Set once via admin script; no UI for editing. Required for Out of Bounds badge.

**Activity categories** (used by Renaissance badge — 12 categories):
- Run, Walk/Hike, Ride, Strength, Yoga/Flexibility, Water, Winter, Racket Sports, Team/Court Sports, Dance, Cardio/Machine, Adventure

**Badge criteria types**:
- `cumulative` — recalculates total from all activities on each sync
- `weekly_cumulative` — recalculates weekly total each sync; resets each week
- `weekly_count` — counts qualifying weeks (e.g. weeks with photos)
- `weekly_streak` — consecutive weeks with activity
- `qualifying_weeks` — counts weeks meeting a threshold (e.g. 12+ hrs)
- `activity_weeks` — counts weeks with N+ activities of specific types
- `habit_weeks` — counts weeks with 100% habit completion
- `unique_sports` — distinct Strava sport_types logged (optionally from a list, with min time)
- `variety_weeks` — counts weeks with N+ distinct activity categories (mapped via ACTIVITY_CATEGORIES)
- `away_hours` — cumulative hours of activities starting 100+ miles from user's stored home location
- `single_activity` — best value from a single activity
- `count` — count of activities meeting a condition

### Habit Tracker (`/habits`)
- Add habits with name and target frequency (1-7 days/week)
- Daily tracking: NEUTRAL → SUCCESS → FAILURE cycle
- 0.5 pts per habit meeting weekly target; only first 5 habits count
- Weekly cron evaluates habit badges for users with 100% completion
- Soft delete preserves history

### Authentication Flow
1. Users sign up/login via Supabase Auth (email or Google)
2. Protected routes redirect to `/login`
3. Session management via middleware

### Strava Integration
1. **OAuth Connection**: `/api/strava/connect`
2. **Webhook Processing**: Automatic sync on activity create/update/delete
3. **Manual Sync**: "Sync Now" fetches last 30 activities
4. **Token Refresh**: Automatic on expiry
5. **Disconnect**: `/api/strava/disconnect`

### Admin Dashboard (`/admin` — Gabriel Beal only)
- **User Management**: View all users; delete; diagnose/repair missing DB entries
- **Badge Management**: Manually assign/remove bronze/silver/gold badges
- **WhatsApp Competition Update**: AI-generated weekly recap (leaderboard, rank changes, badges, rivalry results, top exercisers) via Claude Sonnet; copy-to-clipboard for WhatsApp paste
- **WhatsApp Habit Summary**: Generate weekly habit completion summaries for group chat
- **Manage Summary Participants**: Control which users appear in the habit summary
- **Competition Reset**: 4-step nuclear reset (clears points, badges, activities, habits, rivalry matchups/kill marks; preserves rivalry period schedule)

---

## API Endpoints

### Public
- `GET /` — Home page (unified leaderboard)
- `GET /rivalries` — Rivalry matchups page
- `GET /faq` — FAQ page
- `GET /login` — Auth page
- `GET /auth/callback` — OAuth callback
- `GET /api/strava/webhook` — Webhook verification
- `POST /api/strava/webhook` — Webhook events

### Protected (requires auth)
- `GET /api/leaderboard` — Unified leaderboard with kill marks, rivals, badges
- `GET /api/rivalries` — All rivalry periods + matchups with live stats
- `GET /api/badges` — User's earned badges
- `GET /api/badges/progress` — Badge progress for current user
- `GET /api/habits` — User's habits + current week
- `POST /api/habits` — Create habit
- `PATCH /api/habits/[id]` — Update habit
- `DELETE /api/habits/[id]` — Soft delete habit
- `POST /api/habits/[id]/entries` — Set daily habit status
- `GET /api/habits/history` — Paginated habit history
- `GET /api/strava/connect` — Initiate Strava OAuth
- `GET /api/strava/callback` — Strava OAuth callback
- `POST /api/strava/sync` — Manual sync
- `GET /api/stats/weekly` — Weekly stats
- `GET /profile` — User profile
- `GET /stats` — Badge progress visualization
- `POST /auth/signout` — Sign out

### Admin (Gabriel Beal only)
- `GET /admin` — Admin dashboard
- Server Actions: `deleteUser`, `assignBadge`, `removeBadge`
- `POST /api/admin/generate-habit-summary` — Generate WhatsApp habit summary
- `POST /api/admin/generate-competition-update` — Generate AI competition update (requires `ANTHROPIC_API_KEY`)

### Cron (requires `CRON_SECRET`)
- `GET /api/cron/weekly-division-shuffle` — Sunday 11:59 PM UTC (4 steps in order):
  1. Capture leaderboard snapshot into `leaderboard_snapshots`
  2. Evaluate habit badges for all users with active habits
  3. Reset weekly badge progress for all weekly badge types
  4. Close out ended rivalry periods (compute scores, set winner)
  5. Generate pairings for any rivalry period starting within ±2 days

---

## Rivalry System

### Pairing Algorithm (`lib/rivalries/pairing.ts`)

The `computePairings` function runs automatically in the weekly cron job when a `rivalry_period.start_date` falls within ±2 days of today. It uses a greedy rank-adjacent algorithm:

- **Parameters**: K0=4 (initial window), DELTA=3 (expansion), KMAX=10 (max window), RECENT_AVOIDANCE=2 periods
- **Bye**: If player count is odd, lowest-ranked player sits out (no bye history tracking)
- **Window**: One-directional (downward from current rank); expands by DELTA if no unpaired candidate found
- **Preference order**: (1) never faced → (2) faced but not within last 2 periods → (3) any (KMAX fallback)
- **Tiebreaker**: Closest rank within preference levels; for KMAX fallback: least recently faced, then closest rank
- **Idempotency**: Skips if matchups already exist for that period — safe to run multiple times in the window

### Close-out (`app/api/cron/weekly-division-shuffle/route.ts`)

Runs before pairing, every Sunday night. Finds periods where `end_date <= today` with `player1_score IS NULL` (unresolved). For each:
1. Fetches Strava activities in `[period.start_date T00:00:00Z, period.end_date T23:59:59Z]`
2. Computes scores via `computeMetricScores` → display units
3. Sets `player1_score`, `player2_score`, `winner_id` (NULL for any tie, including 0-0)

`player1_score IS NOT NULL` = matchup is resolved. This distinguishes ties from pending matchups.

### Rivalry Metrics (`lib/rivalries/metrics.ts`)

Shared helper used by both the cron close-out and the live `/api/rivalries` display.

| Metric key | Label | Query | Unit | Sport filter |
|---|---|---|---|---|
| `total_distance` | All-Purpose Distance | SUM(distance) | km | All |
| `run_distance` | Run & Walk Distance | SUM(distance) | km | Run, VirtualRun, TrailRun, Walk, Hike, Snowshoe |
| `moving_time` | Hours Exercised | SUM(moving_time) | hrs | All |
| `elevation_gain` | Elevation Climbed | SUM(total_elevation_gain) | m | All |
| `unique_activity_types` | Variety Week | COUNT(DISTINCT sport_type) | types | All |
| `strength_count` | Strength Sessions | COUNT(*) | sessions | WeightTraining, Workout, Crossfit, HIIT, Pilates |
| `active_days` | Active Days | COUNT(DISTINCT date) | days | All |
| `yoga_time` | Yoga Week | SUM(moving_time) | hrs | Yoga |
| `dance_time` | Dance Week | SUM(moving_time) | hrs | Dance |

### Season 4 Schedule

| Period | Dates | Metric |
|---|---|---|
| 1–4 | Feb 23 – Apr 19 | All-Purpose Distance (pre-season + first real) |
| 5 | Apr 20 – May 3 | Run & Walk Distance |
| 6 | May 4 – May 17 | Strength Sessions |
| 7 | May 18 – May 31 | Hours Exercised |
| 8 | Jun 1 – Jun 14 | Active Days |
| 9 | Jun 15 – Jun 28 | Elevation Climbed |
| 10 | Jun 29 – Jul 12 | Variety Week |
| 11 | Jul 13 – Jul 26 | Yoga Week |
| 12 | Jul 27 – Aug 9 | Dance Week |
| 13 | Aug 10 – Aug 17 | Run & Walk Distance |

Period 4 (Apr 6) is the "real" start date. Periods 1–3 are pre-season warm-up.
Period 13 is 8 days (not 14) — the season ends Aug 17.

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

| # | File | Description |
|---|------|-------------|
| 001 | create_strava_connections.sql | Strava OAuth connections |
| 002 | create_strava_activities.sql | Activity storage |
| 003 | create_divisions.sql | Division system |
| 004 | create_badges.sql | Badge system |
| 005 | admin_policies.sql | Admin RLS policies |
| 006 | create_user_profiles.sql | User profiles |
| 007 | add_weekly_badge_support.sql | Periodic badge support |
| 008 | create_habits.sql | Habit tracker |
| 009 | update_cumulative_points.sql | Cumulative points |
| 010 | add_timezone_to_user_profiles.sql | Timezone support |
| 011 | add_cumulative_points.sql | Enhanced cumulative points |
| 012 | refactor_user_points.sql | Split points columns |
| 013 | add_increment_badge_points_fn.sql | Badge points function |
| 014 | add_user_id_to_habit_entries.sql | Habit entries fix |
| 016 | fix_habit_summaries_rls.sql | Habit summaries RLS |
| 017 | reset_badges_add_dates.sql | Badge date fields |
| 018 | add_suffer_score.sql | Relative Effort tracking |
| 022 | cumulative_points_system.sql | Drop user_points; cumulative scoring |
| 025 | create_summary_participants.sql | WhatsApp summary participants |
| 026 | create_rivalries.sql | Rivalry periods + matchups (Season 4) |
| 029 | update_rivalry_metrics.sql | Expand metric CHECK to 9 types; add player1_score/player2_score; set Season 4 period schedule |
| 030 | rhythm_engine_badge.sql | Deactivate Stridezilla; add Rhythm Engine (cumulative Dance minutes) |
| 031 | badge_season4_updates.sql | Deactivate Pitch Perfect + Net Gain; rework No Chill → qualifying_weeks; add Decathlon (unique_sports) |
| 032 | renaissance_badge.sql | Deactivate Pack Animal; add Renaissance (variety_weeks, 4+ categories/week) |
| 033 | add_home_location.sql | Add home_lat/home_lng to user_profiles |
| 034 | out_of_bounds_badge.sql | Add start_lat/start_lng to strava_activities; add Out of Bounds badge (away_hours) |
| 035 | leaderboard_snapshots.sql | Create leaderboard_snapshots table for weekly rank-change tracking |

---

## Environment Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]  # Required for admin functions

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
- Auto-deploys from GitHub `main` branch
- Environment variables set in Vercel dashboard
- **Cron Jobs**: Weekly habit badge evaluation runs Sundays at 11:59 PM UTC

### Strava Webhook Setup
```bash
node scripts/setup-webhook.js view    # View current subscription
node scripts/setup-webhook.js create  # Create new subscription
node scripts/setup-webhook.js delete  # Delete existing subscription
```

---

## Development Workflow

### Local Development
```bash
npm run dev   # http://localhost:3000
# Uses same Supabase cloud database as production
```

### Test Credentials
- Email: `gabrielxz@yahoo.com`
- Password: `gideonxz`

---

## Known Issues & Solutions

### 1. RLS Policy for Webhooks
**Issue**: Webhooks run without auth context, blocked by RLS
**Solution**: RLS disabled on `strava_activities`

### 2. Strava Relative Avatar URLs
**Issue**: Some Strava profiles return relative URLs (e.g. `avatar/athlete/medium.png`) which break `next/image`
**Solution**: `isAbsoluteUrl()` validator in `Leaderboard.tsx` and `RivalriesView.tsx` — falls back to initials avatar

### 3. Timezone Inconsistency (Fixed Oct 2025)
All APIs standardized to fetch timezone from `user_profiles.timezone`, defaulting to `America/New_York`.

### 4. Webhook Activity Week Assignment (Fixed Oct 2025)
Webhook uses `start_date` (UTC) instead of `start_date_local` to prevent timezone parsing bugs.

### 5. Habit Entries Date Parsing (Fixed Oct 2025)
Date strings appended with `T12:00:00` (noon UTC) to prevent off-by-one-day bugs when converting to user timezone.

### 6. iOS Auth + OAuth (Fixed Sep 2025)
- Logout: Client-side Supabase sign-out + hard redirect (avoids service worker caching)
- Strava Connect: `window.location.href` hard navigation instead of Next.js `<Link>`

### 7. Complete User Deletion
Requires `SUPABASE_SERVICE_ROLE_KEY`. Deletes from: auth.users, strava_activities, user_profiles, user_divisions, user_badges, weekly_exercise_tracking, badge_progress, division_history.

---

## Completed Seasons

- ✅ **Season 1**: Division system (Noodle → Sweaty → Shreddy → Juicy), weekly promotions/relegations
- ✅ **Season 2**: UI Redesign — dark theme, glassmorphism, animated background
- ✅ **Season 3**: Badge system (7 badge types, 3 tiers), habit tracker, cumulative points
  - Champion: Brian Clonaris
- ✅ **Season 4**: Unified leaderboard, rivalries with kill marks (💀), podium top-3 treatment, score breakdown popout, FAQ page

---

## Agent Update Log

### Claude Sonnet 4.6 (2026-03-20): AI Competition Update Generator + Badge/FAQ Cleanup

**Objective**: Build a WhatsApp competition update generator using Claude Sonnet; fix badge list; clean up FAQ copy.

**AI Competition Update Generator**:
- `lib/weekly-update/generator.ts`: fetches current leaderboard (with rank changes vs. previous snapshot), badges earned last week, rivalry results + active matchups, top exercisers, then calls Claude Sonnet (`claude-sonnet-4-6`) to write an exciting WhatsApp-formatted prose update
- `app/api/admin/generate-competition-update/route.ts`: admin-only API route
- `app/admin/CompetitionUpdateGenerator.tsx`: button + preview + copy-to-clipboard UI (same pattern as HabitSummaryGenerator)
- Wired into `AdminDashboard.tsx` above the habit summary section
- `@anthropic-ai/sdk` added to dependencies
- Requires `ANTHROPIC_API_KEY` in Vercel environment variables

**Leaderboard Snapshots**:
- Migration 035: `leaderboard_snapshots` table (`user_id`, `week_start`, `rank`, `total_points`)
- Sunday cron now captures a snapshot at the very start of its run (before any processing) so the competition update generator can show rank changes week-over-week

**Admin Dashboard: Division UI removed**:
- Removed Division column from user table, "Change Division" section, and `changeDivision` server action
- `AdminDashboard.tsx`, `admin/page.tsx`, `actions.ts`, `SummaryParticipantsManager.tsx`, `UserDiagnosticsSection.tsx`, `user-fix-actions.ts` all cleaned of has_division/division references

**Competition Reset updated**:
- Now also deletes all `rivalry_matchups` (resets kill marks to 0)
- Does NOT delete `rivalry_periods` (season schedule preserved)
- `getCompetitionStats()` now includes matchup count in the preview

**Badge list corrected**:
- Removed Tryhard badge (was listed in docs but not present in the database)
- Active badge count: 11 -> 10
- FAQ updated: Rock Solid and No Chill were missing; both added with full descriptions

**FAQ overhaul** (`app/faq/FAQContent.tsx`):
- Each badge is now its own AccordionItem with a full verbose explanation of how to qualify
- Removed all em dashes from copy throughout the file
- Replaced "cron" references with "automatic end-of-week cleanup on Sunday night"
- Added new FAQ item: "I updated an activity on Strava but the app didn't pick up the change" explaining the title-change trick to force re-sync (important for Belfie photos, activity type changes, badge credit)

### Claude Sonnet 4.6 (2026-03-19): Badge System Overhaul + Out of Bounds

**Objective**: Season 4 badge updates — retire old badges, add 4 new ones, implement home-location infrastructure.

**New badge types implemented in `BadgeCalculator.ts`**:
- `qualifying_weeks` — counts weeks where `weekly_exercise_tracking.hours_logged >= min_hours`; uses `counted_weeks` metadata to avoid double-counting
- `variety_weeks` — counts weeks with N+ distinct activity categories (12-category map `ACTIVITY_CATEGORIES` hardcoded in BadgeCalculator)
- `away_hours` — cumulative moving_time (hrs) for activities starting ≥ `min_distance_miles` from user's `home_lat/home_lng`; uses haversine distance

**New badges added**:
- 🛑 No Chill — reworked from weekly_cumulative to qualifying_weeks (12+ hrs/week; 1/6/12 weeks)
- 🕺 Rhythm Engine — cumulative Dance minutes (60/240/600)
- 🏅 Decathlon — unique_sports from 17-sport list, min 15 min each (2/4/6 sports)
- 🎨 Renaissance — variety_weeks, 4+ categories/week (1/4/12 weeks)
- 🧭 Out of Bounds — away_hours, 100+ miles from home (3/10/20 hrs)

**Deactivated**: Stridezilla, Pitch Perfect, Net Gain, Pack Animal

**Home location infrastructure**:
- Migration 033: `home_lat/home_lng REAL` added to `user_profiles`
- Migration 034: `start_lat/start_lng REAL` added to `strava_activities`
- Both sync routes (webhook + manual) now save `activity.start_latlng[0/1]`
- `backfill_start_latlng.js`: one-off script to populate existing activities from polylines
- `suggest_home_locations.js`: clusters last-50-activity start points per user; reverse-geocodes via Nominatim
- `set_home_location.js`: sets home_lat/home_lng for a user by name or email
- Home locations set for 17 users (2026-03-19)

**Other**:
- `app/stats/BadgeProgressDisplay.tsx`: descriptions added for all new criteria types
- `app/faq/FAQContent.tsx`: updated badge table (removed retired badges; added Rhythm Engine, Decathlon, Renaissance, Out of Bounds); added Renaissance category accordion

### Claude Sonnet 4.6 (2026-03-04): Rivalry System — Pairing, Close-out, Metrics

**Objective**: Build end-to-end rivalry automation (pairing + close-out) and fix cron bugs.

**Changes**:
- `lib/rivalries/pairing.ts`: greedy rank-adjacent pairing algorithm (K0=4, DELTA=3, KMAX=10, RECENT_AVOIDANCE=2)
- `lib/rivalries/metrics.ts`: shared metric computation for 9 metric types; returns display-unit scores
- Cron (`weekly-division-shuffle`): added rivalry close-out step (before pairing); fixed `user_id` → `id` column bug; fixed `.maybeSingle()` → `.order().limit(1)` to handle multiple rows
- `/api/rivalries`: switched to shared metrics helper; fixed `elevation_gain` → `total_elevation_gain` column bug; now handles all 9 metric types for live display
- Migration 029: expanded metric CHECK constraint; added `player1_score`/`player2_score` to rivalry_matchups; set all 13 periods' metric assignments
- FAQ: updated rivalry schedule with correct labels and icons for all 13 periods
- `generate_period1_pairings.js`: one-off script to manually populate Period 1 matchups (already run)
- Tie rule: any tie including 0-0 → `winner_id = NULL`, no kill mark for either player
- Close-out detection: `player1_score IS NOT NULL` = resolved; distinguishes ties from pending matchups

### Claude Sonnet 4.6 (2026-02-26): Season 4 Redesign

**Objective**: Remove division system, add rivalries, redesign leaderboard.

**Changes**:
- Removed divisions from leaderboard; replaced `DivisionLeaderboard` + `LoggedInView` + `DivisionSelector` + `WeekProgress` with single `Leaderboard.tsx`
- New `app/api/leaderboard/route.ts`: fetches all users, calculates kill mark multiplier, sorts by `adjusted_points`
- New `app/api/rivalries/route.ts`: rivalry periods + matchups with live metric stats
- New `app/rivalries/` (page + `RivalriesView.tsx`): VS hero layout, live progress bar, kill marks, season schedule
- New `app/faq/` (page + `FAQContent.tsx`): accordion FAQ with badge reference table, rivalry schedule
- Simplified `app/page.tsx` to only use `Leaderboard` + `Navigation` + `AnimatedBackground`
- Navigation updated: added Rivalries (⚔️) and FAQ (📖) links
- Cron job (`weekly-division-shuffle`): removed all division logic; now only evaluates habit badges and resets weekly badge progress
- Migration `026_create_rivalries.sql`: additive-only, safe for production
- Kill marks: 💀 emoji, each adds 1% to score multiplier, affects ranking
- Score breakdown popout: click any score to see exercise/habit/badge/kills breakdown; solid dark background (`rgb(15,18,35)`)
- Podium: top 3 displayed as 2nd|1st|3rd in grid; rank-specific ring/strip colors, pulsing ring + 👑 for 1st
- Mobile podium fix: `grid items-start + marginTop=40` for 2nd/3rd; `truncate` on names/rivals in 2nd/3rd cards; `minHeight:300` on 1st to guarantee height difference

### Codex CLI (2025-09-17): Stability + Correctness Fixes
- Divisions leaderboard: weekly hours computed per-user with timezone-aware week boundaries
- Manual sync: unified with webhook flow, idempotent point recalculation
- Cron weekly reset: corrected JSON filter for weekly badges
- Badge streak logic: replaced deprecated `user_points` dependency with `weekly_exercise_tracking`
- Weekly stats API: modernized with timezone-aware boundaries

### Codex CLI (2025-09-17): iOS Auth + OAuth UX Fixes
- Logout: client-side Supabase sign-out + hard redirect
- Strava connect: hard navigation via `window.location.href`
- Strava disconnect: new `/api/strava/disconnect` endpoint
- `STRAVA_REDIRECT_BASE_URL` env var for OAuth URI construction

### Gemini (2025-09-12): Cumulative Points System Refactor
- Migration `022_cumulative_points_system.sql`: dropped `user_points`, moved to cumulative columns in `user_profiles`
- New `weekly_exercise_tracking` table for cap management
- RPC functions: `increment_exercise_points`, `increment_habit_points`, `increment_badge_points`
- Leaderboard and cron updated to use `total_cumulative_points`

### Gemini (2025-09-10): Points Calculation & Timezone Refactor
- `lib/date-helpers.ts`: centralized timezone-aware date logic
- `lib/points-helpers.ts`: single `recalculateAllWeeklyPoints` function
- Migration `012`: `total_points` as GENERATED column (do not update directly)
