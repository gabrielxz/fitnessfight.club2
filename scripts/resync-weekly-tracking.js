#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

function getWeekEnd(weekStart) {
  const end = new Date(weekStart)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

async function resyncUserWeeklyTracking(userEmail) {
  console.log(`Resyncing weekly tracking for ${userEmail}...`)

  // Get user ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', userEmail)
    .single()

  if (!profile) {
    console.error(`User not found: ${userEmail}`)
    return
  }

  const userId = profile.id
  console.log(`Found user: ${userId}`)

  // Get current week
  const now = new Date()
  const weekStart = getWeekStart(now)
  const weekEnd = getWeekEnd(weekStart)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  console.log(`Current week: ${weekStartStr} to ${weekEnd.toISOString().split('T')[0]}`)

  // Get all activities for this week
  const { data: activities, error } = await supabase
    .from('strava_activities')
    .select('id, name, moving_time, distance, suffer_score, start_date, start_date_local, sport_type')
    .eq('user_id', userId)
    .gte('start_date', weekStart.toISOString())
    .lte('start_date', weekEnd.toISOString())
    .is('deleted_at', null)

  if (error) {
    console.error('Error fetching activities:', error)
    return
  }

  console.log(`Found ${activities?.length || 0} activities for this week`)

  if (activities && activities.length > 0) {
    // Calculate totals
    const totalHours = activities.reduce((sum, activity) => sum + (activity.moving_time / 3600), 0)
    const totalSufferScore = activities.reduce((sum, activity) => sum + (activity.suffer_score || 0), 0)

    console.log('\nActivities this week:')
    activities.forEach(a => {
      const hours = (a.moving_time / 3600).toFixed(2)
      const miles = (a.distance / 1609.34).toFixed(2)
      console.log(`  - ${a.name}: ${hours}h, ${miles}mi, ${a.suffer_score || 0} RE (${a.sport_type})`)
    })

    console.log('\nWeek totals:')
    console.log(`  Total hours: ${totalHours.toFixed(2)}`)
    console.log(`  Total RE (suffer score): ${totalSufferScore}`)
    console.log(`  Exercise points (capped at 10): ${Math.min(totalHours, 10).toFixed(2)}`)

    // Update weekly_exercise_tracking (use update if exists, insert otherwise)
    const { data: existingTracking } = await supabase
      .from('weekly_exercise_tracking')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStartStr)
      .single()

    let updateError
    if (existingTracking) {
      const { error } = await supabase
        .from('weekly_exercise_tracking')
        .update({
          hours_logged: totalHours,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTracking.id)
      updateError = error
    } else {
      const { error } = await supabase
        .from('weekly_exercise_tracking')
        .insert({
          user_id: userId,
          week_start: weekStartStr,
          hours_logged: totalHours,
          updated_at: new Date().toISOString()
        })
      updateError = error
    }

    if (updateError) {
      console.error('Error updating weekly_exercise_tracking:', updateError)
    } else {
      console.log('\n✅ Successfully updated weekly_exercise_tracking')
    }

    // Check badge progress for Tryhard badge
    const { data: badges } = await supabase
      .from('badges')
      .select('id, name, code, criteria')
      .eq('code', 'tryhard')
      .single()

    if (badges) {
      console.log('\nChecking Tryhard badge progress...')
      const { data: progress } = await supabase
        .from('badge_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('badge_id', badges.id)
        .eq('period_start', weekStartStr)
        .single()

      if (progress) {
        console.log(`  Current progress: ${progress.current_value}/${badges.criteria.bronze} RE for Bronze`)
      } else {
        console.log(`  No progress recorded yet`)
      }

      // Update badge progress (handle existing record for weekly badges)
      const existingProgress = await supabase
        .from('badge_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', badges.id)
        .eq('period_start', weekStartStr)
        .single()

      let badgeError
      const progressData = {
        current_value: totalSufferScore,
        bronze_achieved: totalSufferScore >= badges.criteria.bronze,
        silver_achieved: totalSufferScore >= badges.criteria.silver,
        gold_achieved: totalSufferScore >= badges.criteria.gold
      }

      if (existingProgress.data) {
        const { error } = await supabase
          .from('badge_progress')
          .update(progressData)
          .eq('id', existingProgress.data.id)
        badgeError = error
      } else {
        const { error } = await supabase
          .from('badge_progress')
          .insert({
            user_id: userId,
            badge_id: badges.id,
            period_start: weekStartStr,
            period_end: weekEnd.toISOString().split('T')[0],
            ...progressData
          })
        badgeError = error
      }

      if (badgeError) {
        console.error('Error updating badge progress:', badgeError)
      } else {
        console.log('✅ Successfully updated Tryhard badge progress')
      }
    }

  } else {
    console.log('No activities found for this week')
  }
}

// Run for the user
const userEmail = process.argv[2] || 'gabrielbeal@gmail.com'
resyncUserWeeklyTracking(userEmail).catch(console.error)