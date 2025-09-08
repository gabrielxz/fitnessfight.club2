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
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

async function auditWeeklyHours() {
  console.log('=== WEEKLY HOURS AUDIT ===')
  console.log('Current UTC time:', new Date().toISOString())
  
  const currentWeekStart = getWeekStart(new Date())
  const lastWeekStart = new Date(currentWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  
  console.log('Current week starts:', currentWeekStart.toISOString())
  console.log('Last week started:', lastWeekStart.toISOString())
  console.log('')
  
  try {
    // Get all users with names
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, cumulative_points')
      .order('cumulative_points', { ascending: false })
    
    // Get Strava connections for names
    const { data: stravaConnections } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname')
    
    const stravaMap = new Map(
      stravaConnections?.map(c => [
        c.user_id,
        `${c.strava_firstname || ''} ${c.strava_lastname || ''}`.trim()
      ]) || []
    )
    
    for (const profile of profiles) {
      const name = stravaMap.get(profile.id) || profile.full_name || profile.email?.split('@')[0] || 'Unknown'
      
      console.log(`\n=== ${name} (${profile.id.substring(0, 8)}...) ===`)
      console.log(`Cumulative points: ${profile.cumulative_points?.toFixed(2) || '0.00'}`)
      
      // Get current week data
      const { data: currentWeekData } = await supabase
        .from('user_points')
        .select('*')
        .eq('user_id', profile.id)
        .eq('week_start', currentWeekStart.toISOString().split('T')[0])
        .single()
      
      if (currentWeekData) {
        console.log(`\nCurrent week (${currentWeekStart.toISOString().split('T')[0]}):`
)
        console.log(`  Hours: ${currentWeekData.total_hours?.toFixed(2) || '0.00'}`)
        console.log(`  Points: ${currentWeekData.total_points?.toFixed(2) || '0.00'}`)
        console.log(`  Activities: ${currentWeekData.activities_count || 0}`)
        console.log(`  Last activity: ${currentWeekData.last_activity_at || 'None'}`)
        
        // If there are activities, let's check them
        if (currentWeekData.activities_count > 0) {
          const { data: activities } = await supabase
            .from('strava_activities')
            .select('strava_activity_id, name, start_date, start_date_local, moving_time')
            .eq('user_id', profile.id)
            .gte('start_date', currentWeekStart.toISOString())
            .lte('start_date', new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
            .is('deleted_at', null)
            .order('start_date', { ascending: false })
            .limit(5)
          
          if (activities && activities.length > 0) {
            console.log(`  Recent activities this week:`)
            for (const activity of activities) {
              const hours = (activity.moving_time / 3600).toFixed(2)
              console.log(`    - ${activity.name}: ${hours}h on ${activity.start_date_local || activity.start_date} (Strava ID: ${activity.strava_activity_id})`)
            }
          }
        }
      } else {
        console.log(`\nNo data for current week`)
      }
      
      // Get last week data for comparison
      const { data: lastWeekData } = await supabase
        .from('user_points')
        .select('*')
        .eq('user_id', profile.id)
        .eq('week_start', lastWeekStart.toISOString().split('T')[0])
        .single()
      
      if (lastWeekData) {
        console.log(`\nLast week (${lastWeekStart.toISOString().split('T')[0]}):`)
        console.log(`  Hours: ${lastWeekData.total_hours?.toFixed(2) || '0.00'}`)
        console.log(`  Points: ${lastWeekData.total_points?.toFixed(2) || '0.00'}`)
        console.log(`  Activities: ${lastWeekData.activities_count || 0}`)
      }
      
      // Check for any activities that might be misdated
      const { data: recentActivities } = await supabase
        .from('strava_activities')
        .select('strava_activity_id, name, start_date, start_date_local, moving_time')
        .eq('user_id', profile.id)
        .gte('start_date', lastWeekStart.toISOString())
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(10)
      
      if (recentActivities && recentActivities.length > 0) {
        console.log(`\nAll recent activities (last 2 weeks):`)
        for (const activity of recentActivities) {
          const activityWeek = getWeekStart(new Date(activity.start_date))
          const weekLabel = activityWeek.getTime() === currentWeekStart.getTime() ? 'CURRENT' : 
                           activityWeek.getTime() === lastWeekStart.getTime() ? 'LAST' : 'OTHER'
          const hours = (activity.moving_time / 3600).toFixed(2)
          console.log(`  [${weekLabel}] ${activity.name}: ${hours}h on ${activity.start_date} (local: ${activity.start_date_local})`)
        }
      }
    }
    
    console.log('\n=== AUDIT COMPLETE ===')
  } catch (error) {
    console.error('Audit error:', error)
  }
}

auditWeeklyHours()