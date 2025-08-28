# Fitness Fight Club - Technical Documentation

## Project Overview
A web application that syncs with Strava to track exercise data and create custom leaderboards for groups of friends.

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
│   ├── api/
│   │   ├── cron/
│   │   │   └── weekly-division-shuffle/  # Weekly division promotions/relegations
│   │   ├── divisions/            # Division standings API
│   │   ├── stats/weekly/         # Weekly activity statistics
│   │   └── strava/
│   │       ├── callback/         # Strava OAuth callback
│   │       ├── connect/          # Initiate Strava OAuth
│   │       ├── sync/             # Manual activity sync
│   │       └── webhook/          # Strava webhook receiver + points calculation
│   ├── auth/
│   │   ├── callback/             # Supabase OAuth callback
│   │   ├── signout/              # Sign out handler
│   │   └── auth-code-error/      # OAuth error page
│   ├── dashboard/
│   │   ├── page.tsx              # Protected dashboard
│   │   ├── division-display.tsx  # Division standings & leaderboard
│   │   ├── strava-connection.tsx # Strava connection UI
│   │   ├── sync-activities.tsx   # Manual sync button
│   │   └── weekly-stats.tsx      # Weekly hours & points display
│   ├── login/                    # Login/signup page
│   └── page.tsx                  # Landing page
├── context/                      # Release planning documents
│   ├── release-1-divisions-and-points.md
│   ├── release-2-ui-redesign.md
│   └── release-3-badge-system.md
├── lib/supabase/
│   ├── client.ts                 # Browser client
│   ├── server.ts                 # Server client
│   └── middleware.ts             # Session refresh
├── middleware.ts                 # Auth middleware
├── scripts/
│   └── setup-webhook.js          # Strava webhook management
├── supabase/migrations/          # Database migrations
└── vercel.json                   # Cron job configuration
```

## Database Schema

### Core Tables
1. **strava_connections** - Stores user's Strava OAuth tokens and profile
   - RLS: Public read (for webhooks), user-controlled write

2. **strava_activities** - Stores all Strava activity data
   - RLS: **DISABLED** (webhooks need to insert without auth)
   - Soft delete support via `deleted_at` column

3. **strava_webhook_events** - Logs all webhook events for debugging
   - Tracks processing status and errors

### Division System Tables (Release 1)
4. **divisions** - Division definitions (Noodle, Sweaty, Shreddy, Juicy)
   - 4 levels with fun names and emojis
   - Min/max user limits per division

5. **user_divisions** - Current division assignments
   - Tracks which division each user is in
   - Join date for division tenure tracking

6. **division_history** - Promotion/relegation history
   - Tracks all division changes
   - Records final points and position

7. **user_points** - Weekly points cache
   - Points calculation: 1 point per hour, max 10/week
   - Cached to avoid recalculation on each page load

### Views
- **weekly_activity_stats** - Pre-calculated weekly statistics

## Key Features

### Authentication Flow
1. Users sign up/login via Supabase Auth (email or Google)
2. Protected routes redirect to `/login` if not authenticated
3. Session management handled by middleware

### Strava Integration
1. **OAuth Connection**: Users connect via `/api/strava/connect`
2. **Webhook Processing**: Automatic activity sync on create/update/delete
3. **Manual Sync**: "Sync Now" button fetches last 30 activities
4. **Token Refresh**: Automatic refresh when tokens expire

### Activity Tracking
- Stores full activity data (distance, time, elevation, etc.)
- Weekly hours calculation with week-over-week comparison
- Soft delete for activities removed from Strava

### Division System (Release 1 - Implemented)
- **4 Divisions**: Noodle 🍜 → Sweaty 💦 → Shreddy 💪 → Juicy 🧃
- **Points System**: 1 point per hour of exercise, capped at 10 points/week
- **Weekly Promotions/Relegations**: Top user promotes, bottom user relegates (Sundays 11:59 PM UTC)
- **Auto-assignment**: New users start in Noodle division
- **Leaderboards**: Division-specific standings with promotion/relegation zones

## Environment Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]

# Strava OAuth
STRAVA_CLIENT_ID=[client-id]
STRAVA_CLIENT_SECRET=[client-secret]

# Strava Webhooks
STRAVA_WEBHOOK_VERIFY_TOKEN=[random-string]

# Cron Job Security (Release 1)
CRON_SECRET=[secure-random-token]
```

## Deployment

### Vercel
- Auto-deploys from GitHub main branch
- Environment variables set in Vercel dashboard
- Function logs available for debugging webhooks
- **Cron Jobs**: Weekly division shuffle runs Sundays at 11:59 PM UTC

### Strava Webhook Setup
```bash
# View current subscription
node scripts/setup-webhook.js view

# Create new subscription
node scripts/setup-webhook.js create

# Delete existing subscription
node scripts/setup-webhook.js delete
```

## Known Issues & Solutions

### 1. RLS Policy for Webhooks
**Issue**: Webhooks run without auth context, blocked by RLS
**Solution**: RLS disabled on `strava_activities` table
```sql
ALTER TABLE strava_activities DISABLE ROW LEVEL SECURITY;
```

### 2. Manual Activities
**Note**: Manual activities entered on Strava website may not trigger webhooks immediately. Activities recorded through Strava app are more reliable.

### 3. Google OAuth Redirect
**Setup Required**:
- Add redirect URI in Google Cloud Console: `https://[supabase-id].supabase.co/auth/v1/callback`
- Update Supabase URL Configuration with production domain

## Development Workflow

### Local Development
```bash
npm run dev
# App runs on http://localhost:3000
# Uses same Supabase cloud database as production
```

### Testing Webhooks Locally
- Use ngrok for local webhook testing (requires account)
- Or deploy to Vercel and test with production URL

### Database Migrations
Run migrations in Supabase SQL Editor (in order):
1. `001_create_strava_connections.sql`
2. `002_create_strava_activities.sql`
3. `003_create_divisions.sql` (Release 1)

## Security Considerations

1. **Strava tokens** stored encrypted in database
2. **RLS enabled** on sensitive tables (users, connections)
3. **Webhook verification** using `STRAVA_WEBHOOK_VERIFY_TOKEN`
4. **Public read** on connections table (required for webhooks)
5. **User isolation** - users can only see their own data

## API Endpoints

### Public Routes
- `GET /` - Landing page
- `GET /login` - Authentication page
- `GET /auth/callback` - OAuth callback
- `GET /api/strava/webhook` - Webhook verification
- `POST /api/strava/webhook` - Webhook events

### Protected Routes (requires auth)
- `GET /dashboard` - User dashboard (includes division display)
- `GET /api/divisions` - Get division standings and leaderboard
- `GET /api/strava/connect` - Initiate Strava OAuth
- `GET /api/strava/callback` - Strava OAuth callback
- `POST /api/strava/sync` - Manual sync
- `GET /api/stats/weekly` - Weekly statistics (includes points)
- `POST /auth/signout` - Sign out

### Cron Routes (requires CRON_SECRET)
- `GET /api/cron/weekly-division-shuffle` - Weekly promotions/relegations

## Completed Features
- ✅ **Release 1**: Division system with points and weekly promotions/relegations
- ✅ **Release 2**: UI Redesign with dark theme and glassmorphism effects

### Release 2 Details (Completed)
- **Dark Theme**: Gradient background (#0F0F1E → #1A1A2E → #2A1A3E)
- **Glassmorphism**: Glass-card components with backdrop blur
- **Animated Background**: Floating particle effects
- **New Components**:
  - AnimatedBackground: Canvas-based particle animation
  - Navigation: Modern nav with user avatar and glassmorphism
  - DivisionSelector: Toggle between division/global views
  - AthleteCard: Individual athlete cards with zone indicators
  - DivisionLeaderboard: Fetches and displays standings
  - WeekProgress: Competition timeline with progress bar
- **Visual Enhancements**:
  - Orange/yellow gradient accents (#FF6B35, #F7931E)
  - Promotion/relegation zone badges
  - Custom CSS animations (fadeIn, slideUp)
  - Responsive design for all screen sizes

## Upcoming Releases
### Release 3: Badge System
- 10+ badge types with Bronze/Silver/Gold tiers
- Automatic badge calculation on activity sync
- Badge showcase on profiles
- Progress tracking toward next tier

## Future Enhancements
- Custom leaderboards for groups
- Weekly/monthly challenges
- Activity comparisons with friends
- Advanced statistics and progress tracking
- Strava webhook subscription management UI
- Service role key for better webhook security