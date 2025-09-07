const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixCumulativePoints() {
  console.log('Starting cumulative points fix...')
  
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id')
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }
    
    console.log(`Found ${users.length} users to process`)
    
    for (const user of users) {
      // Get all weekly points for this user
      const { data: weeklyPoints, error: pointsError } = await supabase
        .from('user_points')
        .select('total_points, week_start')
        .eq('user_id', user.id)
        .order('week_start', { ascending: true })
      
      if (pointsError) {
        console.error(`Error fetching points for user ${user.id}:`, pointsError)
        continue
      }
      
      // Calculate true cumulative points
      const trueCumulative = weeklyPoints.reduce((sum, week) => sum + (week.total_points || 0), 0)
      
      // Update the user's cumulative points
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          cumulative_points: trueCumulative,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
      
      if (updateError) {
        console.error(`Error updating cumulative points for user ${user.id}:`, updateError)
      } else {
        console.log(`Updated user ${user.id}: cumulative points = ${trueCumulative.toFixed(2)} (from ${weeklyPoints.length} weeks)`)
      }
    }
    
    console.log('Cumulative points fix completed!')
  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

fixCumulativePoints()