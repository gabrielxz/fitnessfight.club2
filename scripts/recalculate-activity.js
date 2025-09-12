const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import BadgeCalculator logic
async function calculateBadgesForActivity(activity) {
  console.log('\n🏅 Calculating badges for activity...');
  
  // Get all active badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true);

  if (!badges) return;

  for (const badge of badges) {
    console.log(`  Checking ${badge.emoji} ${badge.name}...`);
    
    // Check if this activity qualifies for the badge
    if (badge.code === 'iron_calves' && activity.type === 'Ride') {
      // Iron Calves - weekly bike miles
      const miles = (activity.distance || 0) / 1609.34;
      console.log(`    Bike ride: ${miles.toFixed(2)} miles`);
      
      // Get or create badge progress for this week
      const weekStart = getWeekStart(new Date(activity.start_date_local));
      const { data: progress, error } = await supabase
        .from('badge_progress')
        .select('*')
        .eq('user_id', activity.user_id)
        .eq('badge_id', badge.id)
        .eq('period_start', weekStart)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching progress:', error);
        continue;
      }

      const currentValue = (progress?.current_value || 0) + miles;
      console.log(`    Total miles this week: ${currentValue.toFixed(2)}`);

      // Check tier achievements
      let updates = {
        user_id: activity.user_id,
        badge_id: badge.id,
        current_value: currentValue,
        period_start: weekStart,
        period_end: getWeekEnd(weekStart),
        bronze_achieved: currentValue >= badge.criteria.bronze,
        silver_achieved: currentValue >= badge.criteria.silver,
        gold_achieved: currentValue >= badge.criteria.gold,
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      };

      // Upsert progress
      await supabase
        .from('badge_progress')
        .upsert(updates, {
          onConflict: 'user_id,badge_id'
        });

      // Check if we earned a new tier
      if (!progress?.bronze_achieved && updates.bronze_achieved) {
        console.log(`    🎉 Earned Bronze!`);
        await awardBadge(activity.user_id, badge.id, 'bronze');
      } else if (!progress?.silver_achieved && updates.silver_achieved) {
        console.log(`    🎉 Earned Silver!`);
        await awardBadge(activity.user_id, badge.id, 'silver');
      } else if (!progress?.gold_achieved && updates.gold_achieved) {
        console.log(`    🎉 Earned Gold!`);
        await awardBadge(activity.user_id, badge.id, 'gold');
      }
    }
  }
}

async function awardBadge(userId, badgeId, tier) {
  // Check if already awarded
  const { data: existing } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .single();

  if (!existing) {
    // Award new badge
    await supabase
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badgeId,
        tier: tier,
        earned_at: new Date().toISOString()
      });

    // Update badge points
    await updateBadgePoints(userId);
  } else if (tierValue(tier) > tierValue(existing.tier)) {
    // Upgrade tier
    await supabase
      .from('user_badges')
      .update({ tier: tier })
      .eq('id', existing.id);

    await updateBadgePoints(userId);
  }
}

function tierValue(tier) {
  return tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
}

async function updateBadgePoints(userId) {
  // Calculate total badge points
  const { data: badges } = await supabase
    .from('user_badges')
    .select('tier')
    .eq('user_id', userId);

  let points = 0;
  for (const badge of badges || []) {
    if (badge.tier === 'gold') points += 15;
    else if (badge.tier === 'silver') points += 6;
    else if (badge.tier === 'bronze') points += 3;
  }

  // Update current week's badge points
  const weekStart = getWeekStart(new Date());
  await supabase
    .from('user_points')
    .update({ badge_points: points })
    .eq('user_id', userId)
    .eq('week_start', weekStart);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const adjustedDay = day === 0 ? 7 : day;
  const diff = d.getUTCDate() - (adjustedDay - 1);
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  return weekStart.toISOString().split('T')[0];
}

function getWeekEnd(weekStartStr) {
  const weekStart = new Date(weekStartStr);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd.toISOString().split('T')[0];
}

async function recalculateActivity() {
  console.log('Recalculating points and badges for Fake bike ride...\n');

  // Get the activity
  const { data: activity, error } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('name', 'Fake bike ride')
    .single();

  if (error || !activity) {
    console.error('Activity not found');
    return;
  }

  const weekStart = getWeekStart(new Date(activity.start_date_local));
  console.log(`Week: ${weekStart}`);

  // Step 1: Recalculate exercise points for the week
  console.log('\n📊 Recalculating exercise points...');
  const { data: weekActivities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', activity.user_id)
    .gte('start_date', weekStart)
    .lte('start_date', getWeekEnd(weekStart))
    .is('deleted_at', null);

  const totalHours = weekActivities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
  const exercisePoints = Math.min(totalHours, 10);
  
  console.log(`  Total hours: ${totalHours.toFixed(2)}`);
  console.log(`  Exercise points: ${exercisePoints.toFixed(2)} (capped at 10)`);

  // Update user_points
  const { error: updateError } = await supabase
    .from('user_points')
    .upsert({
      user_id: activity.user_id,
      week_start: weekStart,
      week_end: getWeekEnd(weekStart),
      exercise_points: exercisePoints,
      total_hours: totalHours,
      activities_count: weekActivities.length,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,week_start'
    });

  if (updateError) {
    console.error('Error updating points:', updateError);
  } else {
    console.log('  ✅ Points updated successfully');
  }

  // Step 2: Calculate badges for this activity
  await calculateBadgesForActivity(activity);

  // Step 3: Show final results
  console.log('\n📈 Final results:');
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', activity.user_id)
    .eq('week_start', weekStart)
    .single();

  if (finalPoints) {
    console.log(`  Exercise points: ${finalPoints.exercise_points}`);
    console.log(`  Habit points: ${finalPoints.habit_points}`);
    console.log(`  Badge points: ${finalPoints.badge_points}`);
    console.log(`  Total: ${finalPoints.exercise_points + finalPoints.habit_points + finalPoints.badge_points}`);
  }
}

recalculateActivity();