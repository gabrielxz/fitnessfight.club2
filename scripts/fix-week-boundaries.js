#!/usr/bin/env node

/**
 * Migration script to update week_start values from Sunday-based to Monday-based weeks
 * 
 * This script:
 * 1. Updates all week_start values in habit_entries, habit_weekly_summaries, and user_points tables
 * 2. Shifts Sunday data to be part of the previous week (as Sunday is now the last day of the week)
 * 
 * Run with: node scripts/fix-week-boundaries.js
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Please check your .env.local file.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Helper function to get Monday-based week start
function getMondayWeekStart(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

// Helper function to format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0]
}

async function migrateHabitEntries() {
  console.log('Migrating habit_entries table...')
  
  // Get all unique week_start values
  const { data: weekStarts, error: fetchError } = await supabase
    .from('habit_entries')
    .select('week_start, date')
    .order('week_start', { ascending: true })
  
  if (fetchError) {
    console.error('Error fetching habit entries:', fetchError)
    return
  }
  
  // Group by week_start and calculate new values
  const updates = new Map()
  
  for (const entry of weekStarts) {
    const entryDate = new Date(entry.date)
    const newWeekStart = getMondayWeekStart(entryDate)
    const newWeekStartStr = formatDate(newWeekStart)
    
    if (!updates.has(entry.date)) {
      updates.set(entry.date, newWeekStartStr)
    }
  }
  
  // Apply updates
  let updatedCount = 0
  for (const [date, newWeekStart] of updates) {
    const { error: updateError } = await supabase
      .from('habit_entries')
      .update({ week_start: newWeekStart })
      .eq('date', date)
    
    if (updateError) {
      console.error(`Error updating entries for date ${date}:`, updateError)
    } else {
      updatedCount++
    }
  }
  
  console.log(`Updated ${updatedCount} dates in habit_entries`)
}

async function migrateHabitWeeklySummaries() {
  console.log('Migrating habit_weekly_summaries table...')
  
  // Get all summaries
  const { data: summaries, error: fetchError } = await supabase
    .from('habit_weekly_summaries')
    .select('id, week_start')
    .order('week_start', { ascending: true })
  
  if (fetchError) {
    console.error('Error fetching summaries:', fetchError)
    return
  }
  
  let updatedCount = 0
  for (const summary of summaries) {
    // Convert old Sunday-based week_start to Monday-based
    const oldDate = new Date(summary.week_start)
    const dayOfWeek = oldDate.getUTCDay()
    
    // If it was a Sunday (0), it needs to move to the previous Monday
    let newWeekStart
    if (dayOfWeek === 0) {
      // This was a Sunday-starting week
      newWeekStart = new Date(oldDate)
      newWeekStart.setUTCDate(newWeekStart.getUTCDate() + 1) // Move to Monday
    } else {
      // Shouldn't happen, but handle other days by finding their Monday
      newWeekStart = getMondayWeekStart(oldDate)
    }
    
    const newWeekStartStr = formatDate(newWeekStart)
    
    if (newWeekStartStr !== summary.week_start) {
      const { error: updateError } = await supabase
        .from('habit_weekly_summaries')
        .update({ week_start: newWeekStartStr })
        .eq('id', summary.id)
      
      if (updateError) {
        console.error(`Error updating summary ${summary.id}:`, updateError)
      } else {
        updatedCount++
      }
    }
  }
  
  console.log(`Updated ${updatedCount} summaries in habit_weekly_summaries`)
}

async function migrateUserPoints() {
  console.log('Migrating user_points table...')
  
  // Get all user points records
  const { data: points, error: fetchError } = await supabase
    .from('user_points')
    .select('id, week_start')
    .order('week_start', { ascending: true })
  
  if (fetchError) {
    console.error('Error fetching user points:', fetchError)
    return
  }
  
  let updatedCount = 0
  for (const point of points) {
    // Convert old Sunday-based week_start to Monday-based
    const oldDate = new Date(point.week_start)
    const dayOfWeek = oldDate.getUTCDay()
    
    // If it was a Sunday (0), it needs to move to the previous Monday
    let newWeekStart
    if (dayOfWeek === 0) {
      // This was a Sunday-starting week
      newWeekStart = new Date(oldDate)
      newWeekStart.setUTCDate(newWeekStart.getUTCDate() + 1) // Move to Monday
    } else {
      // Shouldn't happen, but handle other days by finding their Monday
      newWeekStart = getMondayWeekStart(oldDate)
    }
    
    const newWeekStartStr = formatDate(newWeekStart)
    
    if (newWeekStartStr !== point.week_start) {
      const { error: updateError } = await supabase
        .from('user_points')
        .update({ week_start: newWeekStartStr })
        .eq('id', point.id)
      
      if (updateError) {
        console.error(`Error updating user points ${point.id}:`, updateError)
      } else {
        updatedCount++
      }
    }
  }
  
  console.log(`Updated ${updatedCount} records in user_points`)
}

async function main() {
  console.log('Starting week boundary migration...')
  console.log('Converting from Sunday-based weeks to Monday-based weeks')
  console.log('------------------------------------------------')
  
  try {
    await migrateHabitEntries()
    await migrateHabitWeeklySummaries()
    await migrateUserPoints()
    
    console.log('------------------------------------------------')
    console.log('Migration completed successfully!')
    console.log('Note: You may need to recalculate weekly summaries after this migration.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()