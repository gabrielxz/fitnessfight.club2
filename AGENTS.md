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
│   │   ├── HabitSummaryGenerator.tsx     # WhatsApp summary generator
│   │   ├── SummaryParticipantsManager.tsx
│   │   ├── CompetitionResetSection.tsx   # Nuclear reset button
│   │   ├── UserDiagnosticsSection.tsx    # Diagnose/fix missing DB entries
│   │   ├── summary-actions.ts
│   │   ├── competition-reset-actions.ts
│   │   └── user-fix-actions.ts
│   ├── api/
│   │   ├── admin/generate-habit-summary/ # Habit summary API
│   │   ├── badges/progress/              # Badge progress API
│   │   ├── cron/
│   │   │   └── weekly-division-shuffle/  # Weekly habit badge eval + badge resets
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

3. **strava_webhook_events** - Webhook event log for debugging

4. **user_profiles** - User metadata and cumulative scores
   - `email`, `full_name`, `avatar_url`, `timezone`
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
    - `period_number`, `start_date`, `end_date`
    - `metric` (distance/moving_time/elevation_gain/suffer_score)
    - `metric_label`, `metric_unit`
    - RLS: public read, admin write only

15. **rivalry_matchups** - Player pairings per period
    - `period_id`, `player1_id`, `player2_id`, `winner_id` (NULL = in-progress or tie)
    - Each player appears at most once per period
    - RLS: public read, admin write only

### Admin
16. **summary_participants** - WhatsApp summary participant list

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
- Bi-weekly 1v1 matchups on a rotating metric (distance, time, elevation, suffer score)
- VS hero layout: large avatars, live metric progress bar, winner crown, kill marks
- `SeasonSchedule` shows all periods with NOW indicator
- Pairing logic (manual admin SQL): rank-adjacent, novel matchups preferred, odd player sits out
- Tie = no kill mark awarded; winner gets 💀 on their record

**FAQ** (`/faq`):
- Accordion sections: Points, Leaderboard, Rivalries, Badges, General
- Explains kill marks, score multiplier, rivalry schedule

### Points System
- **Exercise**: 1 pt/hour, capped at **9 hrs/week** (lowered from 10 in Season 4)
- **Habits**: 0.5 pts per habit that meets its weekly target; first 5 habits only
- **Badges**: 3 pts (bronze) / 6 pts (silver) / 15 pts (gold), awarded once per tier
- **Kill marks**: ×(1 + kills × 0.01) multiplier on total, applied at display/ranking time

### Badge System (7 active badge types)
1. 🥵 **Tryhard** — Relative Effort (suffer score) in one week (600/350/150)
2. 🏔 **Everester** — Cumulative elevation gain in meters (4424/2212/600)
3. 🐂 **Iron Calves** — Bike miles in a week (90/50/10)
4. 🧘 **Zen Master** — Yoga hours in a week (10/4/1)
5. 📸 **Belfie** — Weeks with photo attachments (12/6/1)
6. ⚽ **Pitch Perfect** — Soccer minutes in single session (100/60/30)
7. 🎾 **Net Gain** — Distinct racquet sports played (4/2/1)

Badge point values: Gold 15 pts / Silver 6 pts / Bronze 3 pts

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
- **WhatsApp Summary Generator**: Generate weekly habit summaries for group chat
- **Competition Reset**: 4-step nuclear reset (clears points, badges, activities, habits)
- Note: Division management UI still present but divisions are not used in Season 4 leaderboard

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
- Server Actions: `deleteUser`, `assignBadge`, `removeBadge`, `changeDivision`
- `POST /api/admin/generate-habit-summary` — Generate WhatsApp summary

### Cron (requires `CRON_SECRET`)
- `GET /api/cron/weekly-division-shuffle` — Evaluates habit badges for last week + resets weekly badge progress

---

## Rivalry Admin Operations (Manual SQL)

Rivalries are managed via SQL in the Supabase dashboard (no UI yet).

**Season 4 schedule (all periods — run once to populate):**
```sql
INSERT INTO rivalry_periods (period_number, start_date, end_date, metric, metric_label, metric_unit)
VALUES
  (1,  '2026-02-23', '2026-03-08', 'distance', 'Distance', 'km'),
  (2,  '2026-03-09', '2026-03-22', 'distance', 'Distance', 'km'),
  (3,  '2026-03-23', '2026-04-05', 'distance', 'Distance', 'km'),
  (4,  '2026-04-06', '2026-04-19', 'distance', 'Distance', 'km'),
  (5,  '2026-04-20', '2026-05-03', 'distance', 'Distance', 'km'),
  (6,  '2026-05-04', '2026-05-17', 'distance', 'Distance', 'km'),
  (7,  '2026-05-18', '2026-05-31', 'distance', 'Distance', 'km'),
  (8,  '2026-06-01', '2026-06-14', 'distance', 'Distance', 'km'),
  (9,  '2026-06-15', '2026-06-28', 'distance', 'Distance', 'km'),
  (10, '2026-06-29', '2026-07-12', 'distance', 'Distance', 'km'),
  (11, '2026-07-13', '2026-07-26', 'distance', 'Distance', 'km'),
  (12, '2026-07-27', '2026-08-09', 'distance', 'Distance', 'km'),
  (13, '2026-08-10', '2026-08-17', 'distance', 'Distance', 'km');
-- Note: periods start Monday (day after Sunday cron). Period 13 is 8 days (Aug 17 is a Monday).
-- Update metric/metric_label/metric_unit for each period before it starts.
```

**Create a single rivalry period:**
```sql
INSERT INTO rivalry_periods (period_number, start_date, end_date, metric, metric_label, metric_unit)
VALUES (1, '2026-02-23', '2026-03-08', 'distance', 'Distance', 'km');
```

**Create matchups:**
```sql
INSERT INTO rivalry_matchups (period_id, player1_id, player2_id)
VALUES
  ('period-uuid'::uuid, 'user1-uuid'::uuid, 'user2-uuid'::uuid),
  ('period-uuid'::uuid, 'user3-uuid'::uuid, 'user4-uuid'::uuid);
```

**Award kill mark (set winner):**
```sql
UPDATE rivalry_matchups
SET winner_id = 'winner-uuid'::uuid
WHERE period_id = 'period-uuid'::uuid
  AND (player1_id = 'winner-uuid'::uuid OR player2_id = 'winner-uuid'::uuid);
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
