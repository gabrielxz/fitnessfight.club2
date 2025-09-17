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

async function recalculateBadgesForWeek(userEmail) {
  console.log(`\nRecalculating weekly badge progress for ${userEmail}...`)

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

  // Get all badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true)

  console.log(`Found ${badges?.length || 0} active badges`)

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

  // Process weekly badges
  for (const badge of badges) {
    if (badge.criteria?.reset_period === 'weekly' && badge.criteria?.type === 'weekly_cumulative') {
      console.log(`\n📊 Processing ${badge.name} (${badge.code})...`)

      let totalValue = 0

      // Calculate total for this badge
      for (const activity of activities || []) {
        let actValue = 0

        // Apply activity type filter if specified
        if (badge.criteria.activity_type) {
          if (activity.type !== badge.criteria.activity_type && activity.sport_type !== badge.criteria.activity_type) {
            continue
          }
        }

        switch (badge.criteria.metric) {
          case 'suffer_score':
            actValue = activity.suffer_score || 0
            break
          case 'distance_miles':
            actValue = (activity.distance || 0) / 1609.34
            break
          case 'moving_time_hours':
            actValue = (activity.moving_time || 0) / 3600
            break
          case 'moving_time_minutes':
            actValue = (activity.moving_time || 0) / 60
            break
        }

        totalValue += actValue
      }

      console.log(`  Total value: ${totalValue.toFixed(2)} ${badge.criteria.metric === 'suffer_score' ? 'RE' : badge.criteria.metric.includes('hour') ? 'hours' : 'minutes'}`)

      // Update badge progress
      const progressData = {
        current_value: totalValue,
        bronze_achieved: totalValue >= (badge.criteria.bronze || 999999),
        silver_achieved: totalValue >= (badge.criteria.silver || 999999),
        gold_achieved: totalValue >= (badge.criteria.gold || 999999)
      }

      // Check if progress exists
      const { data: existing } = await supabase
        .from('badge_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .eq('period_start', weekStartStr)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('badge_progress')
          .update(progressData)
          .eq('id', existing.id)
        if (error) {
          console.log(`  ❌ Error updating: ${error.message}`)
        } else {
          console.log(`  ✅ Updated progress: ${totalValue.toFixed(2)}/${badge.criteria.bronze}`)
        }
      } else {
        const { error } = await supabase
          .from('badge_progress')
          .insert({
            user_id: userId,
            badge_id: badge.id,
            period_start: weekStartStr,
            period_end: weekEnd.toISOString().split('T')[0],
            ...progressData
          })
        if (error) {
          console.log(`  ❌ Error creating: ${error.message}`)
        } else {
          console.log(`  ✅ Created progress: ${totalValue.toFixed(2)}/${badge.criteria.bronze}`)
        }
      }
    }
  }

  // Summary of key badges
  console.log('\n=== Weekly Badge Summary ===')

  // Tryhard
  const tryhard = badges.find(b => b.code === 'tryhard')
  if (tryhard) {
    const { data: progress } = await supabase
      .from('badge_progress')
      .select('current_value')
      .eq('user_id', userId)
      .eq('badge_id', tryhard.id)
      .eq('period_start', weekStartStr)
      .single()
    console.log(`🥵 Tryhard: ${progress?.current_value || 0}/${tryhard.criteria.bronze} RE`)
  }

  // Zen Master
  const zenMaster = badges.find(b => b.code === 'zen_master')
  if (zenMaster) {
    const { data: progress } = await supabase
      .from('badge_progress')
      .select('current_value')
      .eq('user_id', userId)
      .eq('badge_id', zenMaster.id)
      .eq('period_start', weekStartStr)
      .single()
    console.log(`🧘 Zen Master: ${(progress?.current_value || 0).toFixed(1)}/${zenMaster.criteria.bronze} minutes`)
  }

  // Cardiac
  const cardiac = badges.find(b => b.code === 'cardiac')
  if (cardiac) {
    const { data: progress } = await supabase
      .from('badge_progress')
      .select('current_value')
      .eq('user_id', userId)
      .eq('badge_id', cardiac.id)
      .eq('period_start', weekStartStr)
      .single()
    console.log(`❤️ Cardiac: ${(progress?.current_value || 0).toFixed(1)}/${cardiac.criteria.bronze} hours`)
  }
}

// Run for the user
const userEmail = process.argv[2] || 'gabrielbeal@gmail.com'
recalculateBadgesForWeek(userEmail).catch(console.error)