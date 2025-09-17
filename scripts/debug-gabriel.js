#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  // Find Gabriel
  const { data: gabriel } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', 'gabrielbeal@gmail.com')
    .single()

  console.log('\n=== GABRIEL\'S PROFILE ===')
  console.log('ID:', gabriel.id)
  console.log('Exercise Points:', gabriel.cumulative_exercise_points)
  console.log('Habit Points:', gabriel.cumulative_habit_points)
  console.log('Badge Points:', gabriel.cumulative_badge_points)
  console.log('Total Points:', gabriel.total_cumulative_points)

  // Check current week's tracking
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  const weekStart = new Date(now.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  console.log('\n=== CURRENT WEEK ===')
  console.log('Week Start:', weekStartStr)

  const { data: tracking } = await supabase
    .from('weekly_exercise_tracking')
    .select('*')
    .eq('user_id', gabriel.id)
    .eq('week_start', weekStartStr)
    .single()

  console.log('Weekly Tracking:', tracking)

  // Check recent activities
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('name, start_date, moving_time')
    .eq('user_id', gabriel.id)
    .gte('start_date', weekStart.toISOString())
    .is('deleted_at', null)
    .order('start_date', { descending: true })
    .limit(5)

  console.log('\n=== THIS WEEK\'S ACTIVITIES ===')
  if (activities && activities.length > 0) {
    activities.forEach(a => {
      const hours = (a.moving_time / 3600).toFixed(2)
      console.log(`- ${a.name}: ${hours}h on ${a.start_date.split('T')[0]}`)
    })
  } else {
    console.log('No activities found this week')
  }

  // Check badges
  const { data: badges } = await supabase
    .from('user_badges')
    .select('badge_id, tier, points_awarded')
    .eq('user_id', gabriel.id)

  console.log('\n=== BADGES ===')
  console.log(`Total badges: ${badges?.length || 0}`)
  if (badges) {
    let totalBadgePoints = 0
    badges.forEach(b => {
      console.log(`- Badge ${b.badge_id}: ${b.tier} tier (${b.points_awarded} points)`)
      totalBadgePoints += b.points_awarded || 0
    })
    console.log(`Total badge points: ${totalBadgePoints}`)
  }
}

main().catch(console.error)