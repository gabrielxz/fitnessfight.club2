#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role for admin access
)

async function checkPoints() {
  console.log('Checking user_points table...\n')
  
  // Get all points records
  const { data: points, error } = await supabase
    .from('user_points')
    .select('*')
    .order('week_start', { ascending: false })
    .order('user_id')
  
  if (error) {
    console.error('Error fetching points:', error)
    return
  }
  
  if (!points || points.length === 0) {
    console.log('No points records found.')
    return
  }
  
  // Group by week
  const weekGroups = {}
  points.forEach(p => {
    const week = p.week_start
    if (!weekGroups[week]) {
      weekGroups[week] = []
    }
    weekGroups[week].push(p)
  })
  
  console.log(`Found ${points.length} total points records across ${Object.keys(weekGroups).length} weeks:\n`)
  
  // Show summary by week
  Object.keys(weekGroups).sort().reverse().forEach(week => {
    const weekPoints = weekGroups[week]
    const totalPoints = weekPoints.reduce((sum, p) => sum + (p.total_points || 0), 0)
    const totalExercise = weekPoints.reduce((sum, p) => sum + (p.exercise_points || 0), 0)
    const totalHabit = weekPoints.reduce((sum, p) => sum + (p.habit_points || 0), 0)
    const totalBadge = weekPoints.reduce((sum, p) => sum + (p.badge_points || 0), 0)
    
    console.log(`Week starting ${week}:`)
    console.log(`  - ${weekPoints.length} users`)
    console.log(`  - Total points: ${totalPoints.toFixed(2)}`)
    console.log(`  - Exercise: ${totalExercise.toFixed(2)}, Habit: ${totalHabit.toFixed(2)}, Badge: ${totalBadge.toFixed(2)}`)
    console.log(`  - Activities count: ${weekPoints.reduce((sum, p) => sum + (p.activities_count || 0), 0)}`)
  })
  
  // Check for activities in the same weeks
  console.log('\n\nChecking for corresponding activities...\n')
  
  for (const week of Object.keys(weekGroups).sort().reverse()) {
    const weekEnd = new Date(week)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    const { count } = await supabase
      .from('strava_activities')
      .select('*', { count: 'exact', head: true })
      .gte('start_date', week)
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    console.log(`Week ${week}: ${count || 0} activities found`)
  }
  
  return weekGroups
}

async function deleteOldPoints(weeksBefore) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - (weeksBefore * 7))
  const cutoffStr = cutoffDate.toISOString().split('T')[0]
  
  console.log(`\nDeleting all points records before ${cutoffStr}...\n`)
  
  // First check what we're about to delete
  const { data: toDelete, error: checkError } = await supabase
    .from('user_points')
    .select('*')
    .lt('week_start', cutoffStr)
  
  if (checkError) {
    console.error('Error checking points to delete:', checkError)
    return
  }
  
  if (!toDelete || toDelete.length === 0) {
    console.log('No points records to delete.')
    return
  }
  
  console.log(`About to delete ${toDelete.length} points records...`)
  
  // Actually delete
  const { error: deleteError } = await supabase
    .from('user_points')
    .delete()
    .lt('week_start', cutoffStr)
  
  if (deleteError) {
    console.error('Error deleting points:', deleteError)
    return
  }
  
  console.log(`Successfully deleted ${toDelete.length} points records.`)
}

async function deleteAllPoints() {
  console.log('\nWARNING: About to delete ALL points records!\n')
  
  const { count } = await supabase
    .from('user_points')
    .select('*', { count: 'exact', head: true })
  
  console.log(`This will delete ${count || 0} records.`)
  
  // Actually delete
  const { error } = await supabase
    .from('user_points')
    .delete()
    .neq('user_id', '00000000-0000-0000-0000-000000000000') // Always true condition
  
  if (error) {
    console.error('Error deleting all points:', error)
    return
  }
  
  console.log(`Successfully deleted all points records.`)
}

// Parse command line arguments
const args = process.argv.slice(2)
const command = args[0]

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required in .env.local')
    process.exit(1)
  }
  
  if (command === 'delete-all') {
    await deleteAllPoints()
  } else if (command === 'delete-old') {
    const weeks = parseInt(args[1]) || 4
    await deleteOldPoints(weeks)
  } else {
    // Default: just check
    await checkPoints()
    
    console.log('\n\nOptions:')
    console.log('  node scripts/check-and-clean-points.js               # Check current points')
    console.log('  node scripts/check-and-clean-points.js delete-old 2  # Delete points older than 2 weeks')
    console.log('  node scripts/check-and-clean-points.js delete-all    # Delete ALL points')
  }
}

main().catch(console.error)