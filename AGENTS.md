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
│   ├── components/
│   │   ├── DivisionLeaderboard.tsx # Division standings & leaderboard
│   │   ├── DivisionSelector.tsx    # My Division/Global toggle
│   │   ├── LoggedInView.tsx        # Authenticated user view
│   │   ├── AthleteCard.tsx         # Individual athlete display
│   │   ├── strava-connection.tsx   # Strava connection UI
│   │   ├── sync-activities.tsx     # Manual sync button
│   │   └── WeekProgress.tsx        # Week progress bar
│   ├── login/                       # Login/signup page
│   ├── profile/                     # User profile page
│   └── page.tsx                     # Landing/Dashboard (conditional based on auth)
├── context/                      # Release planning documents
│   ├── release-1-divisions-and-points.md
│   ├── release-2-ui-redesign.md
│   └── release-3-badge-system.md
├── lib/
│   ├── badges/
│   │   └── BadgeCalculator.ts    # Badge calculation logic
│   └── supabase/
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
- **4 Divisions**: Noodle 🍜 (Level 1) → Sweaty 💦 (Level 2) → Shreddy 💪 (Level 3) → Juicy 🧃 (Level 4)
- **Display Order**: Juicy shown first (most competitive), then descending by level
- **Points System**: 1 point per hour of exercise, capped at 10 points/week
- **Weekly Promotions/Relegations**: Top 1 user promotes, bottom 1 user relegates (Sundays 11:59 PM UTC)
- **Auto-assignment**: New users start in Noodle division
- **Leaderboards**: Division-specific standings with promotion/relegation zones (only rank #1 and last rank show zone indicators)

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

### Test Credentials
For local development and testing:
- Email: `gabrielxz@yahoo.com`
- Password: `gideonxz`

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
- `GET /` - Landing page (shows all divisions when not logged in, shows personalized dashboard when logged in)
- `GET /login` - Authentication page
- `GET /auth/callback` - OAuth callback
- `GET /api/strava/webhook` - Webhook verification
- `POST /api/strava/webhook` - Webhook events

### Protected Routes (requires auth)
- `GET /` - Home page shows personalized dashboard when logged in
- `GET /api/divisions` - Get division standings and leaderboard
- `GET /api/badges` - Get user's earned badges
- `GET /api/badges/progress` - Get badge progress for current user
- `GET /api/strava/connect` - Initiate Strava OAuth
- `GET /api/strava/callback` - Strava OAuth callback
- `POST /api/strava/sync` - Manual sync
- `GET /api/stats/weekly` - Weekly statistics (includes points)
- `GET /profile` - User profile page
- `POST /auth/signout` - Sign out

### Cron Routes (requires CRON_SECRET)
- `GET /api/cron/weekly-division-shuffle` - Weekly promotions/relegations

## Completed Features
- ✅ **Release 1**: Division system with points and weekly promotions/relegations
- ✅ **Release 2**: UI Redesign with dark theme and glassmorphism effects
- ✅ **Release 3**: Badge System with 10 badge types and Bronze/Silver/Gold tiers

### Release 2 Details (Completed)
- **Dark Theme**: Gradient background (#0F0F1E → #1A1A2E → #2A1A3E)
- **Glassmorphism**: Glass-card components with backdrop blur
- **Animated Background**: Floating particle effects
- **New Components**:
  - AnimatedBackground: Canvas-based particle animation
  - Navigation: Modern nav with user avatar and glassmorphism
  - DivisionSelector: Toggle between "My Division" and "Global" views (authenticated users only)
  - AthleteCard: Individual athlete cards with zone indicators and badges
  - DivisionLeaderboard: Fetches and displays standings with proper zone calculation
  - WeekProgress: Competition timeline with progress bar
  - LoggedInView: Handles authenticated user view with division/global toggle
- **Visual Enhancements**:
  - Orange/yellow gradient accents (#FF6B35, #F7931E)
  - Promotion/relegation zone badges
  - Custom CSS animations (fadeIn, slideUp)
  - Responsive design for all screen sizes

### Release 3 Details (Completed)
- **10 Badge Types**: Early Bird, Night Owl, Power Hour, Consistency King, Globe Trotter, Mountain Climber, Speed Demon, Runner, Cyclist, Variety Pack
- **3 Tiers**: Bronze, Silver, Gold for each badge
- **Automatic Calculation**: BadgeCalculator runs on every webhook activity
- **Database Tables**: badges, user_badges, badge_progress
- **Display**: Badges shown on athlete cards in leaderboards
- **Note**: Badge removal on activity deletion not yet implemented (badges remain once earned)

## Future Enhancements
- Custom leaderboards for groups
- Weekly/monthly challenges
- Activity comparisons with friends
- Advanced statistics and progress tracking
- Strava webhook subscription management UI
- Service role key for better webhook security