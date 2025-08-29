# Release 3: Badge System

## Implementation Status
**Started:** August 28, 2025  
**Branch:** `feature/release-3-badge-system`

### ✅ Completed
1. Created feature branch `feature/release-3-badge-system`
2. Created database migration file `/supabase/migrations/004_create_badges.sql` with:
   - `badges` table with all 10 badge definitions
   - `user_badges` table for tracking earned badges
   - `badge_progress` table for tracking progress
   - Proper indexes and RLS policies

### 🔄 In Progress
- BadgeCalculator service implementation

### ⏳ To Do
1. Complete BadgeCalculator service (`/lib/badges/BadgeCalculator.ts`)
2. Update webhook handler to calculate badges
3. Create badge API endpoints (`/app/api/badges/`)
4. Implement BadgeDisplay component
5. Create BadgeProgress component  
6. Update AthleteCard to show badges
7. Test implementation with Playwright
8. Commit changes to feature branch

## Overview
This release implements a comprehensive badge system that rewards users for various achievements. Badges have three tiers (Bronze, Silver, Gold) and are automatically calculated when new activities arrive via webhook. The system tracks progress toward each badge tier and displays earned badges on user profiles and leaderboards.

## Badge Categories & Criteria

### Time-Based Badges
1. **Early Bird** 🌅 - Activities before 7 AM local time
   - Bronze: 5 activities
   - Silver: 20 activities  
   - Gold: 50 activities

2. **Night Owl** 🌙 - Activities after 9 PM local time
   - Bronze: 5 activities
   - Silver: 20 activities
   - Gold: 50 activities

3. **Power Hour** ⚡ - High-intensity single activities
   - Bronze: 300 calories in 1 hour
   - Silver: 500 calories in 1 hour
   - Gold: 900 calories in 1 hour

4. **Consistency King** 👑 - Consecutive weeks with activities
   - Bronze: 4 weeks
   - Silver: 12 weeks
   - Gold: 26 weeks

### Distance & Elevation Badges
5. **Globe Trotter** 🌍 - Total distance covered
   - Bronze: 100 km
   - Silver: 500 km
   - Gold: 1000 km

6. **Mountain Climber** 🏔️ - Total elevation gain
   - Bronze: 1,000 m
   - Silver: 5,000 m
   - Gold: 10,000 m

7. **Speed Demon** 🚀 - Average speed achievements
   - Bronze: 25 km/h average (cycling)
   - Silver: 30 km/h average
   - Gold: 35 km/h average

### Activity Type Badges
8. **Runner** 🏃 - Running-specific milestones
   - Bronze: 50 km total
   - Silver: 200 km total
   - Gold: 500 km total

9. **Cyclist** 🚴 - Cycling-specific milestones
   - Bronze: 200 km total
   - Silver: 1000 km total
   - Gold: 5000 km total

10. **Variety Pack** 🎯 - Different activity types
    - Bronze: 3 different sports
    - Silver: 5 different sports
    - Gold: 8 different sports

## Database Schema

### 1. Create `badges` table
```sql
CREATE TABLE badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- 'early_bird', 'night_owl', etc.
  name TEXT NOT NULL, -- 'Early Bird'
  description TEXT,
  emoji TEXT NOT NULL, -- '🌅'
  category TEXT NOT NULL, -- 'time', 'distance', 'activity'
  criteria JSONB NOT NULL, -- Detailed criteria for each tier
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert badge definitions
INSERT INTO badges (code, name, emoji, category, criteria) VALUES
('early_bird', 'Early Bird', '🌅', 'time', '{
  "type": "count",
  "condition": "start_hour < 7",
  "bronze": 5,
  "silver": 20,
  "gold": 50
}'::jsonb),
('night_owl', 'Night Owl', '🌙', 'time', '{
  "type": "count",
  "condition": "start_hour >= 21",
  "bronze": 5,
  "silver": 20,
  "gold": 50
}'::jsonb),
('power_hour', 'Power Hour', '⚡', 'intensity', '{
  "type": "single_activity",
  "metric": "calories_per_hour",
  "bronze": 300,
  "silver": 500,
  "gold": 900
}'::jsonb),
('consistency_king', 'Consistency King', '👑', 'streak', '{
  "type": "weekly_streak",
  "bronze": 4,
  "silver": 12,
  "gold": 26
}'::jsonb),
('globe_trotter', 'Globe Trotter', '🌍', 'distance', '{
  "type": "cumulative",
  "metric": "distance_km",
  "bronze": 100,
  "silver": 500,
  "gold": 1000
}'::jsonb),
('mountain_climber', 'Mountain Climber', '🏔️', 'elevation', '{
  "type": "cumulative",
  "metric": "elevation_gain",
  "bronze": 1000,
  "silver": 5000,
  "gold": 10000
}'::jsonb),
('speed_demon', 'Speed Demon', '🚀', 'speed', '{
  "type": "single_activity",
  "metric": "average_speed_kmh",
  "activity_type": "Ride",
  "bronze": 25,
  "silver": 30,
  "gold": 35
}'::jsonb),
('runner', 'Runner', '🏃', 'activity', '{
  "type": "cumulative",
  "metric": "distance_km",
  "activity_type": "Run",
  "bronze": 50,
  "silver": 200,
  "gold": 500
}'::jsonb),
('cyclist', 'Cyclist', '🚴', 'activity', '{
  "type": "cumulative",
  "metric": "distance_km",
  "activity_type": "Ride",
  "bronze": 200,
  "silver": 1000,
  "gold": 5000
}'::jsonb),
('variety_pack', 'Variety Pack', '🎯', 'variety', '{
  "type": "unique_sports",
  "bronze": 3,
  "silver": 5,
  "gold": 8
}'::jsonb);
```

### 2. Create `user_badges` table
```sql
CREATE TABLE user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  progress_value DECIMAL(10, 2), -- Current progress toward next tier
  next_tier_target DECIMAL(10, 2), -- Target for next tier
  activities_contributing INTEGER[], -- Array of activity IDs that contributed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- Indexes
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX idx_user_badges_earned_at ON user_badges(earned_at DESC);

-- RLS
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all badges" ON user_badges
  FOR SELECT USING (true);
```

### 3. Create `badge_progress` table (for tracking progress)
```sql
CREATE TABLE badge_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  current_value DECIMAL(10, 2) DEFAULT 0,
  bronze_achieved BOOLEAN DEFAULT false,
  silver_achieved BOOLEAN DEFAULT false,
  gold_achieved BOOLEAN DEFAULT false,
  last_activity_id BIGINT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- Store additional tracking data
  UNIQUE(user_id, badge_id)
);

-- Indexes
CREATE INDEX idx_badge_progress_user_badge ON badge_progress(user_id, badge_id);
```

## Badge Calculation Engine

### 1. Create Badge Calculator Service (`lib/badges/BadgeCalculator.ts`)

```typescript
import { SupabaseClient } from '@supabase/supabase-js'

interface Activity {
  strava_activity_id: number
  user_id: string
  start_date_local: string
  distance: number
  moving_time: number
  calories: number
  total_elevation_gain: number
  average_speed: number
  type: string
  sport_type: string
}

interface Badge {
  id: string
  code: string
  name: string
  emoji: string
  criteria: any
}

export class BadgeCalculator {
  constructor(private supabase: SupabaseClient) {}
  
  async calculateBadgesForActivity(activity: Activity) {
    // Get all active badges
    const { data: badges } = await this.supabase
      .from('badges')
      .select('*')
      .eq('active', true)
    
    if (!badges) return
    
    for (const badge of badges) {
      await this.evaluateBadge(badge, activity)
    }
  }
  
  private async evaluateBadge(badge: Badge, activity: Activity) {
    const { criteria } = badge
    const userId = activity.user_id
    
    // Get or create progress record
    const { data: progress } = await this.supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single()
    
    let currentProgress = progress || {
      user_id: userId,
      badge_id: badge.id,
      current_value: 0,
      bronze_achieved: false,
      silver_achieved: false,
      gold_achieved: false
    }
    
    // Calculate based on badge type
    switch (criteria.type) {
      case 'count':
        await this.handleCountBadge(badge, activity, currentProgress)
        break
      case 'cumulative':
        await this.handleCumulativeBadge(badge, activity, currentProgress)
        break
      case 'single_activity':
        await this.handleSingleActivityBadge(badge, activity, currentProgress)
        break
      case 'weekly_streak':
        await this.handleWeeklyStreakBadge(badge, activity, currentProgress)
        break
      case 'unique_sports':
        await this.handleVarietyBadge(badge, activity, currentProgress)
        break
    }
  }
  
  private async handleCountBadge(badge: Badge, activity: Activity, progress: any) {
    const { criteria } = badge
    let qualifies = false
    
    // Check if activity meets condition
    if (criteria.condition === 'start_hour < 7') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour < 7
    } else if (criteria.condition === 'start_hour >= 21') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour >= 21
    }
    
    if (qualifies) {
      progress.current_value += 1
      
      // Check tier achievements
      const tierAchieved = this.checkTierProgress(
        progress.current_value,
        criteria,
        progress
      )
      
      if (tierAchieved) {
        await this.awardBadge(badge, activity.user_id, tierAchieved, progress.current_value)
      }
      
      // Update progress
      await this.supabase
        .from('badge_progress')
        .upsert({
          ...progress,
          last_activity_id: activity.strava_activity_id,
          last_updated: new Date().toISOString()
        })
    }
  }
  
  private async handleCumulativeBadge(badge: Badge, activity: Activity, progress: any) {
    const { criteria } = badge
    let increment = 0
    
    // Check activity type filter
    if (criteria.activity_type && activity.type !== criteria.activity_type) {
      return
    }
    
    // Calculate increment based on metric
    switch (criteria.metric) {
      case 'distance_km':
        increment = (activity.distance || 0) / 1000
        break
      case 'elevation_gain':
        increment = activity.total_elevation_gain || 0
        break
    }
    
    progress.current_value += increment
    
    const tierAchieved = this.checkTierProgress(
      progress.current_value,
      criteria,
      progress
    )
    
    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, progress.current_value)
    }
    
    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }
  
  private async handleSingleActivityBadge(badge: Badge, activity: Activity, progress: any) {
    const { criteria } = badge
    let value = 0
    
    // Check activity type filter
    if (criteria.activity_type && activity.type !== criteria.activity_type) {
      return
    }
    
    switch (criteria.metric) {
      case 'calories_per_hour':
        const hours = activity.moving_time / 3600
        value = hours > 0 ? (activity.calories || 0) / hours : 0
        break
      case 'average_speed_kmh':
        value = (activity.average_speed || 0) * 3.6 // Convert m/s to km/h
        break
    }
    
    // Check if this activity achieves any tier
    let tierAchieved = null
    if (!progress.gold_achieved && value >= criteria.gold) {
      tierAchieved = 'gold'
    } else if (!progress.silver_achieved && value >= criteria.silver) {
      tierAchieved = 'silver'
    } else if (!progress.bronze_achieved && value >= criteria.bronze) {
      tierAchieved = 'bronze'
    }
    
    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, value)
      
      // Update progress flags
      progress[`${tierAchieved}_achieved`] = true
      await this.supabase
        .from('badge_progress')
        .upsert({
          ...progress,
          current_value: Math.max(progress.current_value, value),
          last_activity_id: activity.strava_activity_id,
          last_updated: new Date().toISOString()
        })
    }
  }
  
  private async handleWeeklyStreakBadge(badge: Badge, activity: Activity, progress: any) {
    // Get all weeks with activities for this user
    const { data: weeklyActivity } = await this.supabase
      .from('user_points')
      .select('week_start')
      .eq('user_id', activity.user_id)
      .gt('total_hours', 0)
      .order('week_start', { ascending: false })
    
    if (!weeklyActivity) return
    
    // Calculate consecutive weeks
    let streak = 0
    let lastWeek = null
    
    for (const week of weeklyActivity) {
      const weekDate = new Date(week.week_start)
      
      if (!lastWeek) {
        streak = 1
        lastWeek = weekDate
      } else {
        const diffDays = (lastWeek.getTime() - weekDate.getTime()) / (1000 * 60 * 60 * 24)
        
        if (diffDays === 7) {
          streak++
          lastWeek = weekDate
        } else {
          break
        }
      }
    }
    
    progress.current_value = streak
    
    const tierAchieved = this.checkTierProgress(
      streak,
      badge.criteria,
      progress
    )
    
    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, streak)
    }
    
    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }
  
  private async handleVarietyBadge(badge: Badge, activity: Activity, progress: any) {
    // Get unique sport types for this user
    const { data: uniqueSports } = await this.supabase
      .from('strava_activities')
      .select('sport_type')
      .eq('user_id', activity.user_id)
      .is('deleted_at', null)
    
    if (!uniqueSports) return
    
    const uniqueTypes = new Set(uniqueSports.map(s => s.sport_type))
    const count = uniqueTypes.size
    
    progress.current_value = count
    
    const tierAchieved = this.checkTierProgress(
      count,
      badge.criteria,
      progress
    )
    
    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, count)
    }
    
    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        metadata: { sports: Array.from(uniqueTypes) },
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }
  
  private checkTierProgress(value: number, criteria: any, progress: any): string | null {
    if (!progress.gold_achieved && value >= criteria.gold) {
      return 'gold'
    } else if (!progress.silver_achieved && value >= criteria.silver) {
      return 'silver'
    } else if (!progress.bronze_achieved && value >= criteria.bronze) {
      return 'bronze'
    }
    return null
  }
  
  private async awardBadge(badge: Badge, userId: string, tier: string, value: number) {
    // Check if already awarded
    const { data: existing } = await this.supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single()
    
    if (existing) {
      // Update to higher tier if achieved
      const tierOrder = { bronze: 1, silver: 2, gold: 3 }
      if (tierOrder[tier] > tierOrder[existing.tier]) {
        await this.supabase
          .from('user_badges')
          .update({
            tier,
            progress_value: value,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      }
    } else {
      // Award new badge
      await this.supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badge.id,
          tier,
          progress_value: value
        })
    }
  }
}
```

### 2. Update Webhook Handler (`app/api/strava/webhook/route.ts`)

Add badge calculation after activity storage:

```typescript
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'

// After storing activity and calculating points
const badgeCalculator = new BadgeCalculator(supabase)
await badgeCalculator.calculateBadgesForActivity({
  strava_activity_id: activity.id,
  user_id: connection.user_id,
  start_date_local: activity.start_date_local,
  distance: activity.distance,
  moving_time: activity.moving_time,
  calories: activity.calories,
  total_elevation_gain: activity.total_elevation_gain,
  average_speed: activity.average_speed,
  type: activity.type,
  sport_type: activity.sport_type
})
```

## Frontend Components

### 1. Badge Display Component (`app/components/BadgeDisplay.tsx`)

```tsx
interface Badge {
  emoji: string
  name: string
  tier: 'bronze' | 'silver' | 'gold'
}

interface BadgeDisplayProps {
  badges: Badge[]
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export default function BadgeDisplay({ 
  badges, 
  size = 'md', 
  showLabel = false 
}: BadgeDisplayProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  }
  
  const tierColors = {
    gold: 'from-yellow-400 to-yellow-600',
    silver: 'from-gray-300 to-gray-500',
    bronze: 'from-orange-600 to-orange-800'
  }
  
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge, idx) => (
        <div key={idx} className="relative group">
          <div className="relative">
            <span className={`${sizeClasses[size]} filter drop-shadow-lg transition-transform group-hover:scale-125`}>
              {badge.emoji}
            </span>
            <div className={`
              absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900
              bg-gradient-to-br ${tierColors[badge.tier]}
            `} />
          </div>
          {showLabel && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                          opacity-0 group-hover:opacity-100 transition-opacity
                          bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              {badge.name} ({badge.tier})
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

### 2. Badge Progress Component (`app/dashboard/BadgeProgress.tsx`)

```tsx
'use client'

import { useEffect, useState } from 'react'

interface BadgeProgressData {
  badge: {
    name: string
    emoji: string
    criteria: any
  }
  current_value: number
  next_tier: string | null
  next_tier_target: number | null
  percentage: number
}

export default function BadgeProgress({ userId }: { userId: string }) {
  const [progress, setProgress] = useState<BadgeProgressData[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetchBadgeProgress()
  }, [userId])
  
  async function fetchBadgeProgress() {
    try {
      const response = await fetch('/api/badges/progress')
      const data = await response.json()
      setProgress(data)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) return <div>Loading badge progress...</div>
  
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-bold mb-4">Badge Progress</h3>
      <div className="space-y-4">
        {progress.map((item, idx) => (
          <div key={idx} className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{item.badge.emoji}</span>
                <span className="font-medium">{item.badge.name}</span>
              </div>
              {item.next_tier && (
                <span className="text-sm text-gray-400">
                  Next: {item.next_tier} ({item.next_tier_target})
                </span>
              )}
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {item.current_value} / {item.next_tier_target || 'Max'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 3. Badge API Endpoint (`app/api/badges/route.ts`)

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Get user's badges
  const { data: userBadges } = await supabase
    .from('user_badges')
    .select(`
      *,
      badge:badges(*)
    `)
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
  
  return NextResponse.json(userBadges || [])
}
```

### 4. Update Athlete Card to Show Badges

In the division leaderboard, fetch and display badges for each user:

```typescript
// In the division API, include badges:
const { data: divisionUsers } = await supabase
  .from('user_divisions')
  .select(`
    user_id,
    ...,
    user_badges!inner(
      tier,
      badge:badges(emoji, name)
    )
  `)
  .eq('division_id', userDivision.division_id)

// Pass badges to AthleteCard component
<AthleteCard
  badges={user.user_badges?.map(ub => ({
    emoji: ub.badge.emoji,
    name: ub.badge.name,
    tier: ub.tier
  })) || []}
  //... other props
/>
```

## Badge Recalculation Job (Optional)

### Create Recalculation Endpoint (`app/api/badges/recalculate/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  // Verify admin or cron auth
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { userId } = await request.json()
  const supabase = await createClient()
  
  // Get all user's activities
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })
  
  // Reset badge progress
  await supabase
    .from('badge_progress')
    .delete()
    .eq('user_id', userId)
  
  await supabase
    .from('user_badges')
    .delete()
    .eq('user_id', userId)
  
  // Recalculate all badges
  const calculator = new BadgeCalculator(supabase)
  for (const activity of activities) {
    await calculator.calculateBadgesForActivity(activity)
  }
  
  return NextResponse.json({ success: true, processed: activities.length })
}
```

## Implementation Steps

1. **Database Setup**
   - Run badge table migrations
   - Insert badge definitions
   - Create indexes for performance

2. **Backend Implementation**
   - Deploy BadgeCalculator class
   - Update webhook handler to calculate badges
   - Create badge API endpoints

3. **Frontend Components**
   - Add BadgeDisplay component
   - Update AthleteCard to show badges
   - Create badge progress view

4. **Testing**
   - Test each badge type with sample activities
   - Verify tier progression works correctly
   - Test badge display on leaderboards

5. **Performance Optimization**
   - Batch badge calculations for bulk imports
   - Cache badge data on frontend
   - Use database triggers for complex calculations

## Testing Scenarios

### Early Bird Badge
1. Create activity with start_date_local at 6:00 AM
2. Verify badge progress increments
3. Create 5 activities → Bronze awarded
4. Create 20 activities → Silver awarded

### Power Hour Badge
1. Create activity with 300 calories in 1 hour
2. Verify Bronze badge awarded immediately
3. Create activity with 900 calories in 1 hour
4. Verify Gold badge awarded (upgrades from Bronze)

### Consistency King Badge
1. Create activities in 4 consecutive weeks
2. Verify Bronze badge awarded
3. Continue for 12 weeks total
4. Verify Silver badge awarded

### Variety Pack Badge
1. Create activities with 3 different sport_types
2. Verify Bronze badge awarded
3. Add 5 more unique sport types
4. Verify Gold badge awarded

## Performance Considerations

- Badge calculations run asynchronously after activity storage
- Use database indexes for fast queries
- Cache badge data in Redis for leaderboard display
- Batch process historical data during off-peak hours
- Consider queue system for high-volume badge calculations

## Future Enhancements

1. **Social Badges**
   - "Team Player" - Exercise with friends
   - "Motivator" - Give kudos to others

2. **Seasonal Badges**
   - Holiday-themed challenges
   - Monthly special badges

3. **Custom Badges**
   - User-created challenges
   - Group-specific badges

4. **Badge Levels**
   - Prestige system after Gold
   - Diamond/Platinum tiers

5. **Badge Trading/Showcasing**
   - Featured badge on profile
   - Badge collections/albums