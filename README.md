# Fitness Fight Club

A web app for tracking exercise data and creating custom leaderboards with friends using Strava integration.

## Tech Stack

- **Next.js 16** (App Router)
- **Supabase** (Authentication & Database)
- **Vercel** (Deployment)
- **TypeScript**
- **Tailwind CSS**

## Getting Started

### 1. Set up Supabase

1. Create a new project at [https://app.supabase.com](https://app.supabase.com)
2. In your project settings, go to **Settings → API**
3. Copy your project URL and anon public key

### 2. Configure Environment Variables

Copy the `.env.local.example` file to `.env.local`:

```bash
cp .env.local.example .env.local
```

Update `.env.local` with your Supabase and Strava credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
STRAVA_CLIENT_ID=your_strava_client_id_here
STRAVA_CLIENT_SECRET=your_strava_client_secret_here
```

### 3. Set up Database Tables

Run the SQL migration in your Supabase SQL editor:

```sql
-- Copy contents from supabase/migrations/001_create_strava_connections.sql
```

### 4. Configure Strava OAuth

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application
3. Set Authorization Callback Domain to `localhost:3000` for development
4. Copy your Client ID and Client Secret to `.env.local`

### 5. Enable Google Authentication in Supabase

1. In Supabase dashboard, go to **Authentication → Providers**
2. Enable Google provider
3. Add your Google OAuth credentials (you'll need to set up a Google Cloud project)
4. Add `http://localhost:3000/auth/callback` to the authorized redirect URLs

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

## Features

- ✅ User authentication (Email/Password & Google OAuth)
- ✅ Protected dashboard route
- ✅ Session management with middleware
- ✅ Strava OAuth connection
- 🚧 Strava webhook integration (coming soon)
- 🚧 Activity sync from Strava (coming soon)
- 🚧 Custom leaderboards (coming soon)
- 🚧 Activity tracking and stats (coming soon)

## Project Structure

```
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/
│   │   └── page.tsx                # Login/Signup page
│   ├── dashboard/
│   │   ├── page.tsx                # Protected dashboard
│   │   └── strava-connection.tsx   # Strava connection component
│   ├── api/
│   │   └── strava/
│   │       ├── connect/
│   │       │   └── route.ts        # Strava OAuth initiation
│   │       └── callback/
│   │           └── route.ts        # Strava OAuth callback
│   └── auth/
│       ├── callback/
│       │   └── route.ts            # Supabase OAuth callback
│       └── signout/
│           └── route.ts            # Sign out handler
├── lib/
│   └── supabase/
│       ├── client.ts               # Browser client
│       ├── server.ts               # Server client
│       └── middleware.ts           # Session refresh
├── supabase/
│   └── migrations/
│       └── 001_create_strava_connections.sql
└── middleware.ts                   # Next.js middleware
```

## Deployment to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add your environment variables in Vercel project settings
4. Deploy!

Remember to update your Supabase OAuth redirect URLs to include your production domain.
