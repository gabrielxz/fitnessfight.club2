const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getWeekBoundaries(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const adjustedDay = day === 0 ? 7 : day;
  const diff = d.getUTCDate() - (adjustedDay - 1);
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { 
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0]
  };
}

async function recalculateAllPoints() {
  console.log('📊 Recalculating points for all users...\n');

  // Get all users with activities
  const { data: users } = await supabase
    .from('strava_activities')
    .select('user_id')
    .is('deleted_at', null);

  if (!users || users.length === 0) {
    console.log('No users with activities found');
    return;
  }

  const uniqueUsers = [...new Set(users.map(u => u.user_id))];
  console.log(`Found ${uniqueUsers.length} users with activities\n`);

  // Get current week boundaries
  const { weekStart, weekEnd } = getWeekBoundaries(new Date());
  console.log(`Current week: ${weekStart} to ${weekEnd}\n`);

  for (const userId of uniqueUsers) {
    console.log(`Processing user ${userId.substring(0, 8)}...`);

    // Get all activities for this week
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', userId)
      .gte('start_date', weekStart)
      .lte('start_date', weekEnd + 'T23:59:59')
      .is('deleted_at', null);

    if (!activities || activities.length === 0) {
      console.log('  No activities this week');
      continue;
    }

    // Calculate total hours and exercise points
    const totalHours = activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
    const exercisePoints = Math.min(totalHours, 10);

    // Get existing points record
    const { data: existing } = await supabase
      .from('user_points')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .single();

    const pointsData = {
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      exercise_points: exercisePoints,
      habit_points: existing?.habit_points || 0,
      badge_points: existing?.badge_points || 0,
      total_hours: totalHours,
      activities_count: activities.length,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('user_points')
      .upsert(pointsData, {
        onConflict: 'user_id,week_start'
      });

    if (error) {
      console.error(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ ${activities.length} activities, ${totalHours.toFixed(2)} hours, ${exercisePoints.toFixed(2)} points`);
    }
  }

  console.log('\n✨ Points recalculation complete!');
}

recalculateAllPoints().catch(console.error);