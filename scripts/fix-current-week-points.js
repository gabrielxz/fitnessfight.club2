const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Helper to get week start (Monday)
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

async function fixCurrentWeekPoints() {
  console.log('=== FIXING CURRENT WEEK POINTS ===')
  
  const currentWeekStart = getWeekStart(new Date())
  const currentWeekEnd = getWeekEnd(currentWeekStart)
  const weekStartStr = currentWeekStart.toISOString().split('T')[0]
  
  console.log('Current week:', weekStartStr, 'to', currentWeekEnd.toISOString().split('T')[0])
  
  try {
    // Get all user_points entries for current week
    const { data: currentWeekPoints, error: fetchError } = await supabase
      .from('user_points')
      .select('*')
      .eq('week_start', weekStartStr)
    
    if (fetchError) {
      console.error('Error fetching current week points:', fetchError)
      return
    }
    
    console.log(`Found ${currentWeekPoints?.length || 0} user_points entries for current week`)
    
    for (const entry of currentWeekPoints || []) {
      // Get actual activities for this user in current week
      const { data: activities, error: actError } = await supabase
        .from('strava_activities')
        .select('moving_time, start_date')
        .eq('user_id', entry.user_id)
        .gte('start_date', currentWeekStart.toISOString())
        .lte('start_date', currentWeekEnd.toISOString())
        .is('deleted_at', null)
      
      if (actError) {
        console.error(`Error fetching activities for user ${entry.user_id}:`, actError)
        continue
      }
      
      // Calculate actual hours and points
      const actualHours = activities?.reduce((sum, act) => sum + (act.moving_time / 3600), 0) || 0
      const actualPoints = Math.min(actualHours, 10) // Cap at 10 points per week
      const actualCount = activities?.length || 0
      const lastActivity = activities?.length > 0 ? 
        activities.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0].start_date : 
        null
      
      // Check if update is needed
      if (entry.total_hours !== actualHours || 
          entry.total_points !== actualPoints || 
          entry.activities_count !== actualCount) {
        
        console.log(`\nUser ${entry.user_id}:`)
        console.log(`  OLD: ${entry.total_hours?.toFixed(2)}h, ${entry.total_points?.toFixed(2)}pts, ${entry.activities_count} activities`)
        console.log(`  NEW: ${actualHours.toFixed(2)}h, ${actualPoints.toFixed(2)}pts, ${actualCount} activities`)
        
        if (actualCount === 0) {
          // No activities, delete the entry
          const { error: deleteError } = await supabase
            .from('user_points')
            .delete()
            .eq('id', entry.id)
          
          if (deleteError) {
            console.error(`  ERROR deleting entry:`, deleteError)
          } else {
            console.log(`  DELETED empty week entry`)
          }
        } else {
          // Update with correct values
          const { error: updateError } = await supabase
            .from('user_points')
            .update({
              total_hours: actualHours,
              total_points: actualPoints,
              activities_count: actualCount,
              last_activity_at: lastActivity,
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.id)
          
          if (updateError) {
            console.error(`  ERROR updating:`, updateError)
          } else {
            console.log(`  UPDATED successfully`)
          }
        }
      } else {
        console.log(`User ${entry.user_id}: No changes needed (${actualHours.toFixed(2)}h)`)
      }
    }
    
    console.log('\n=== FIX COMPLETE ===')
  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

fixCurrentWeekPoints()