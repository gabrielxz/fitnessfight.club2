# Release 1: Core Division & Points System

## Overview
This release implements the foundational division system and points calculation for Fitness Fight Club. Users will be assigned to competitive divisions (Bronze, Silver, Gold, Platinum, Diamond, Champion) with weekly promotions/relegations based on performance. Points are earned at 1 point per hour of exercise, capped at 10 points per week.

## Key Features
- Division assignment and management system
- Weekly points calculation with 10-hour cap
- Division leaderboards showing top/bottom performers
- Automated weekly promotion/relegation (Sunday 11:59 PM UTC)
- Points caching to avoid recalculation on every page load

## Database Schema

### 1. Create `divisions` table
```sql
CREATE TABLE divisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion'
  level INTEGER NOT NULL UNIQUE, -- 1-6, for ordering
  min_users INTEGER DEFAULT 4, -- Minimum users per division
  max_users INTEGER DEFAULT 10, -- Maximum users per division
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed divisions
INSERT INTO divisions (name, level) VALUES
  ('Bronze', 1),
  ('Silver', 2),
  ('Gold', 3),
  ('Platinum', 4),
  ('Diamond', 5),
  ('Champion', 6);
```

### 2. Create `user_divisions` table
```sql
CREATE TABLE user_divisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  division_id UUID REFERENCES divisions(id),
  joined_division_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE user_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all division assignments" ON user_divisions
  FOR SELECT USING (true);

CREATE POLICY "Service can manage divisions" ON user_divisions
  FOR ALL USING (auth.uid() IS NOT NULL);
```

### 3. Create `division_history` table
```sql
CREATE TABLE division_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  from_division_id UUID REFERENCES divisions(id),
  to_division_id UUID REFERENCES divisions(id),
  change_type TEXT NOT NULL, -- 'promotion', 'relegation', 'initial'
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  final_points DECIMAL(10, 2),
  final_position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_division_history_user_id ON division_history(user_id);
CREATE INDEX idx_division_history_week ON division_history(week_end DESC);
```

### 4. Create `user_points` table
```sql
CREATE TABLE user_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours DECIMAL(10, 2) DEFAULT 0,
  total_points DECIMAL(10, 2) DEFAULT 0, -- Capped at 10
  activities_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

-- Indexes
CREATE INDEX idx_user_points_week ON user_points(week_start DESC);
CREATE INDEX idx_user_points_user_week ON user_points(user_id, week_start DESC);

-- RLS
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all points" ON user_points
  FOR SELECT USING (true);
```

## Backend Implementation

### 1. Update Webhook Handler (`app/api/strava/webhook/route.ts`)
After storing activity, calculate and update points:

```typescript
// After successful activity storage
await calculateUserPoints(connection.user_id, activity);

async function calculateUserPoints(userId: string, activity: any) {
  const weekStart = getWeekStart(new Date(activity.start_date));
  const weekEnd = getWeekEnd(weekStart);
  
  // Get or create user_points record for this week
  const { data: existingPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart.toISOString())
    .single();
  
  const activityHours = activity.moving_time / 3600;
  
  if (existingPoints) {
    const newTotalHours = existingPoints.total_hours + activityHours;
    const newPoints = Math.min(newTotalHours, 10); // Cap at 10 points
    
    await supabase
      .from('user_points')
      .update({
        total_hours: newTotalHours,
        total_points: newPoints,
        activities_count: existingPoints.activities_count + 1,
        last_activity_at: activity.start_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingPoints.id);
  } else {
    const points = Math.min(activityHours, 10);
    
    await supabase
      .from('user_points')
      .insert({
        user_id: userId,
        week_start: weekStart.toISOString(),
        week_end: weekEnd.toISOString(),
        total_hours: activityHours,
        total_points: points,
        activities_count: 1,
        last_activity_at: activity.start_date
      });
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
```

### 2. Create Division API (`app/api/divisions/route.ts`)

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Get user's current division
  const { data: userDivision } = await supabase
    .from('user_divisions')
    .select('*, division:divisions(*)')
    .eq('user_id', user.id)
    .single();
  
  if (!userDivision) {
    // Assign to Bronze division if not assigned
    await assignUserToDivision(user.id, 'Bronze');
    return NextResponse.json({ division: 'Bronze', newUser: true });
  }
  
  // Get current week points
  const weekStart = getWeekStart(new Date());
  
  // Get all users in the same division with their points
  const { data: divisionUsers } = await supabase
    .from('user_divisions')
    .select(`
      user_id,
      auth.users!inner(email),
      strava_connections!inner(strava_firstname, strava_lastname),
      user_points!inner(total_points, total_hours)
    `)
    .eq('division_id', userDivision.division_id)
    .eq('user_points.week_start', weekStart.toISOString())
    .order('user_points.total_points', { ascending: false });
  
  // Find user's position
  const position = divisionUsers?.findIndex(u => u.user_id === user.id) + 1 || 0;
  const totalInDivision = divisionUsers?.length || 0;
  
  // Determine zone
  let zone = 'safe';
  if (position === 1 && userDivision.division.level < 6) {
    zone = 'promotion';
  } else if (position === totalInDivision && userDivision.division.level > 1) {
    zone = 'relegation';
  }
  
  return NextResponse.json({
    division: userDivision.division,
    position,
    totalInDivision,
    zone,
    leaderboard: divisionUsers
  });
}
```

### 3. Create Weekly Cron Job (`app/api/cron/weekly-division-shuffle/route.ts`)

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const supabase = await createClient()
  const weekStart = getWeekStart(new Date())
  weekStart.setDate(weekStart.getDate() - 7) // Last week
  const weekEnd = getWeekEnd(weekStart)
  
  // Get all divisions
  const { data: divisions } = await supabase
    .from('divisions')
    .select('*')
    .order('level', { ascending: true })
  
  for (const division of divisions) {
    // Get users in this division with their points for last week
    const { data: users } = await supabase
      .from('user_divisions')
      .select(`
        user_id,
        user_points!inner(total_points)
      `)
      .eq('division_id', division.id)
      .eq('user_points.week_start', weekStart.toISOString())
      .order('user_points.total_points', { ascending: false })
    
    if (!users || users.length === 0) continue
    
    // Promote top user (if not in Champion division)
    if (division.level < 6 && users.length > 0) {
      const topUser = users[0]
      const nextDivision = divisions.find(d => d.level === division.level + 1)
      
      await supabase
        .from('user_divisions')
        .update({ 
          division_id: nextDivision.id,
          joined_division_at: new Date().toISOString()
        })
        .eq('user_id', topUser.user_id)
      
      // Log history
      await supabase
        .from('division_history')
        .insert({
          user_id: topUser.user_id,
          from_division_id: division.id,
          to_division_id: nextDivision.id,
          change_type: 'promotion',
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          final_points: topUser.user_points.total_points,
          final_position: 1
        })
    }
    
    // Relegate bottom user (if not in Bronze division)
    if (division.level > 1 && users.length > 0) {
      const bottomUser = users[users.length - 1]
      const prevDivision = divisions.find(d => d.level === division.level - 1)
      
      await supabase
        .from('user_divisions')
        .update({ 
          division_id: prevDivision.id,
          joined_division_at: new Date().toISOString()
        })
        .eq('user_id', bottomUser.user_id)
      
      // Log history
      await supabase
        .from('division_history')
        .insert({
          user_id: bottomUser.user_id,
          from_division_id: division.id,
          to_division_id: prevDivision.id,
          change_type: 'relegation',
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          final_points: bottomUser.user_points.total_points,
          final_position: users.length
        })
    }
  }
  
  return NextResponse.json({ success: true, shuffled: new Date().toISOString() })
}
```

### 4. Vercel Cron Configuration (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-division-shuffle",
      "schedule": "59 23 * * 0"
    }
  ]
}
```

## Frontend Updates

### 1. Update Dashboard (`app/dashboard/page.tsx`)
- Add division display component showing current division and position
- Show points alongside hours in weekly stats
- Add promotion/relegation zone indicator

### 2. Create Division Display Component (`app/dashboard/division-display.tsx`)

```tsx
'use client'

import { useEffect, useState } from 'react'

interface DivisionDisplayProps {
  userId: string
}

export default function DivisionDisplay({ userId }: DivisionDisplayProps) {
  const [divisionData, setDivisionData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/divisions')
      .then(res => res.json())
      .then(data => {
        setDivisionData(data)
        setLoading(false)
      })
  }, [])
  
  if (loading) return <div>Loading division...</div>
  if (!divisionData) return null
  
  const { division, position, totalInDivision, zone } = divisionData
  
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {division.name} Division
          </h2>
          <p className="text-gray-600 mt-1">
            Position: #{position} of {totalInDivision}
          </p>
        </div>
        {zone === 'promotion' && (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
            ↑ Promotion Zone
          </span>
        )}
        {zone === 'relegation' && (
          <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
            ↓ Relegation Zone
          </span>
        )}
      </div>
      
      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Division Standings</h3>
        <div className="space-y-2">
          {divisionData.leaderboard?.map((user, idx) => (
            <div key={user.user_id} className={`flex justify-between p-2 rounded ${
              user.user_id === userId ? 'bg-blue-50' : ''
            }`}>
              <span className="flex items-center gap-2">
                <span className="text-gray-500">#{idx + 1}</span>
                <span className="font-medium">
                  {user.strava_connections?.strava_firstname} {user.strava_connections?.strava_lastname}
                </span>
              </span>
              <div className="flex gap-4 text-sm">
                <span>{user.user_points?.total_points?.toFixed(1)} pts</span>
                <span className="text-gray-500">{user.user_points?.total_hours?.toFixed(1)}h</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

### 3. Update Weekly Stats Component
Modify `app/dashboard/weekly-stats.tsx` to also display points:

```tsx
// Add to the stats display:
<div>
  <p className="text-sm text-gray-600">Weekly Points</p>
  <p className="text-3xl font-bold text-gray-900">
    {Math.min(stats.currentWeekHours, 10).toFixed(1)}
  </p>
  <p className="text-xs text-gray-500">Max 10 pts/week</p>
</div>
```

## Environment Variables
Add to `.env.local`:
```
CRON_SECRET=your-secure-cron-secret-here
```

Add to Vercel Environment Variables:
- `CRON_SECRET` - same value as local

## Testing Plan

1. **Division Assignment**
   - Create new user → should be assigned to Bronze
   - Check division displays correctly

2. **Points Calculation**
   - Add activity < 10 hours → points = hours
   - Add activities > 10 hours total → points capped at 10
   - Verify points reset each week

3. **Division Standings**
   - Check leaderboard ordering by points
   - Verify promotion/relegation zones display correctly

4. **Weekly Shuffle (Manual Test)**
   - Trigger cron endpoint manually with auth header
   - Verify top user promoted, bottom user relegated
   - Check division_history records created

## Migration Steps

1. Run all SQL migrations in order
2. Deploy backend API changes
3. Deploy frontend components
4. Configure Vercel cron job
5. Test with a few users first
6. Monitor first weekly shuffle

## Success Metrics
- All users assigned to divisions
- Points calculated correctly with 10-hour cap
- Division standings update in real-time
- Weekly shuffle executes successfully Sunday 11:59 PM UTC
- Division history tracked for analytics