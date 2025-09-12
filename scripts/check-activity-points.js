const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get week boundaries (Monday to Sunday)
function getWeekBoundaries(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const adjustedDay = day === 0 ? 7 : day;
  const diff = d.getUTCDate() - (adjustedDay - 1);
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

async function checkActivityPoints() {
  console.log('Checking Fake bike ride activity and points...\n');

  // Get the activity
  const { data: activity, error: actError } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('name', 'Fake bike ride')
    .single();

  if (actError || !activity) {
    console.error('Activity not found:', actError);
    return;
  }

  console.log('✅ Activity found:');
  console.log(`  ID: ${activity.strava_activity_id}`);
  console.log(`  User: ${activity.user_id}`);
  console.log(`  Date: ${activity.start_date_local}`);
  console.log(`  Distance: ${(activity.distance / 1609.34).toFixed(2)} miles`);
  console.log(`  Time: ${(activity.moving_time / 60).toFixed(0)} minutes (${(activity.moving_time / 3600).toFixed(2)} hours)`);
  console.log(`  Type: ${activity.type} / ${activity.sport_type}`);
  console.log(`  Manual: ${activity.manual}`);
  console.log(`  Deleted: ${activity.deleted_at || 'No'}\n`);

  // Get the week for this activity
  const { weekStart, weekEnd } = getWeekBoundaries(new Date(activity.start_date_local));
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  
  console.log(`📅 Activity week: ${weekStartStr} to ${weekEndStr}\n`);

  // Check user_points for this week
  const { data: points, error: pointsError } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', activity.user_id)
    .eq('week_start', weekStartStr)
    .single();

  if (pointsError) {
    console.log('❌ No points record found for this week');
    console.log('   Error:', pointsError.message);
  } else if (points) {
    console.log('📊 User points for this week:');
    console.log(`  Exercise points: ${points.exercise_points}`);
    console.log(`  Habit points: ${points.habit_points}`);
    console.log(`  Badge points: ${points.badge_points}`);
    console.log(`  Total points: ${points.total_points || (points.exercise_points + points.habit_points + points.badge_points)}`);
    console.log(`  Total hours: ${points.total_hours}`);
    console.log(`  Activities count: ${points.activities_count}`);
    console.log(`  Updated: ${points.updated_at}\n`);
  }

  // Check all activities for this user this week
  const { data: weekActivities, error: weekActError } = await supabase
    .from('strava_activities')
    .select('name, moving_time, start_date_local')
    .eq('user_id', activity.user_id)
    .gte('start_date', weekStart.toISOString())
    .lte('start_date', weekEnd.toISOString())
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (weekActivities && weekActivities.length > 0) {
    console.log(`📋 All activities this week (${weekActivities.length} total):`);
    let totalHours = 0;
    weekActivities.forEach(act => {
      const hours = act.moving_time / 3600;
      totalHours += hours;
      console.log(`  - ${act.name}: ${hours.toFixed(2)} hours (${act.start_date_local})`);
    });
    console.log(`  Total: ${totalHours.toFixed(2)} hours\n`);
  }

  // Check badge progress for Iron Calves (biking miles)
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'iron_calves')
    .single();

  if (badges) {
    const { data: badgeProgress } = await supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', activity.user_id)
      .eq('badge_id', badges.id)
      .eq('period_start', weekStartStr)
      .single();

    if (badgeProgress) {
      console.log('🏅 Iron Calves badge progress:');
      console.log(`  Current value: ${badgeProgress.current_value} miles`);
      console.log(`  Bronze (10 mi): ${badgeProgress.bronze_achieved ? '✅' : '❌'}`);
      console.log(`  Silver (50 mi): ${badgeProgress.silver_achieved ? '✅' : '❌'}`);
      console.log(`  Gold (90 mi): ${badgeProgress.gold_achieved ? '✅' : '❌'}\n`);
    } else {
      console.log('❌ No badge progress found for Iron Calves this week\n');
    }
  }

  // Check if badge was earned
  const { data: earnedBadges } = await supabase
    .from('user_badges')
    .select('*, badges(*)')
    .eq('user_id', activity.user_id);

  if (earnedBadges && earnedBadges.length > 0) {
    console.log('🏆 Earned badges:');
    earnedBadges.forEach(b => {
      console.log(`  ${b.badges.emoji} ${b.badges.name} - ${b.tier}`);
    });
  } else {
    console.log('No badges earned yet');
  }
}

checkActivityPoints();