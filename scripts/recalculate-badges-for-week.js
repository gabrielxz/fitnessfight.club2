#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Import BadgeCalculator
const { BadgeCalculator } = require('../lib/badges/BadgeCalculator')

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

async function recalculateBadgesForWeek(userEmail) {
  console.log(`Recalculating badges for ${userEmail}...`)

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
    .select('*')
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
    // Initialize BadgeCalculator
    const badgeCalculator = new BadgeCalculator(supabase)

    // Process each activity
    for (const activity of activities) {
      console.log(`Processing activity: ${activity.name}`)

      try {
        await badgeCalculator.calculateBadgesForActivity({
          strava_activity_id: activity.strava_activity_id,
          user_id: activity.user_id,
          start_date_local: activity.start_date_local,
          distance: activity.distance,
          moving_time: activity.moving_time,
          calories: activity.calories || 0,
          total_elevation_gain: activity.total_elevation_gain,
          average_speed: activity.average_speed,
          type: activity.type,
          sport_type: activity.sport_type,
          suffer_score: activity.suffer_score,
          photo_count: activity.photo_count
        })

        console.log(`  ✓ Processed: ${(activity.moving_time / 3600).toFixed(2)}h, ${activity.suffer_score || 0} RE`)
      } catch (err) {
        console.error(`  ✗ Error processing activity: ${err.message}`)
      }
    }

    // Now check badge progress for key badges
    console.log('\n--- Badge Progress Summary ---')

    // Check Tryhard badge
    const { data: tryhard } = await supabase
      .from('badges')
      .select('id, name, criteria')
      .eq('code', 'tryhard')
      .single()

    if (tryhard) {
      const { data: tryhardProgress } = await supabase
        .from('badge_progress')
        .select('current_value')
        .eq('user_id', userId)
        .eq('badge_id', tryhard.id)
        .eq('period_start', weekStartStr)
        .single()

      console.log(`🥵 Tryhard: ${tryhardProgress?.current_value || 0}/${tryhard.criteria.bronze} RE for Bronze`)
    }

    // Check Zen Master badge
    const { data: zenMaster } = await supabase
      .from('badges')
      .select('id, name, criteria')
      .eq('code', 'zen_master')
      .single()

    if (zenMaster) {
      const { data: zenProgress } = await supabase
        .from('badge_progress')
        .select('current_value')
        .eq('user_id', userId)
        .eq('badge_id', zenMaster.id)
        .eq('period_start', weekStartStr)
        .single()

      console.log(`🧘 Zen Master: ${(zenProgress?.current_value || 0).toFixed(1)}/${zenMaster.criteria.bronze} minutes for Bronze`)
    }

    // Check Cardiac badge (weekly cardio)
    const { data: cardiac } = await supabase
      .from('badges')
      .select('id, name, criteria')
      .eq('code', 'cardiac')
      .single()

    if (cardiac) {
      const { data: cardiacProgress } = await supabase
        .from('badge_progress')
        .select('current_value')
        .eq('user_id', userId)
        .eq('badge_id', cardiac.id)
        .eq('period_start', weekStartStr)
        .single()

      console.log(`❤️ Cardiac: ${(cardiacProgress?.current_value || 0).toFixed(1)}/${cardiac.criteria.bronze} hours for Bronze`)
    }

  } else {
    console.log('No activities found for this week')
  }
}

// Run for the user
const userEmail = process.argv[2] || 'gabrielbeal@gmail.com'
recalculateBadgesForWeek(userEmail).catch(console.error)