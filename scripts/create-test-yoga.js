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

async function createTestYoga() {
  console.log('🧘 Creating test yoga activity...\n');

  // Get Gabriel's user info
  const { data: user } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', 'gabrielbeal@gmail.com')
    .single();

  if (!user) {
    console.error('User not found');
    return;
  }

  const userId = user.id;
  console.log(`User ID: ${userId}\n`);

  // Get athlete ID from connection
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('athlete_id')
    .eq('user_id', userId)
    .single();

  const athleteId = connection?.athlete_id || '97838209';

  // Create a unique fake activity ID (timestamp-based)
  const fakeActivityId = Date.now();
  const now = new Date();
  
  const yogaActivity = {
    user_id: userId,
    strava_athlete_id: athleteId,
    strava_activity_id: fakeActivityId,
    name: 'Fake Yoga Session',
    type: 'Yoga',
    sport_type: 'Yoga',
    start_date: now.toISOString(),
    start_date_local: now.toISOString(),
    timezone: '(GMT-08:00) America/Los_Angeles',
    distance: 0,
    moving_time: 3900, // 65 minutes (1.08 hours) - enough for Bronze badge
    elapsed_time: 3900,
    total_elevation_gain: 0,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    trainer: false,
    commute: false,
    manual: true,
    private: false,
    average_speed: 0,
    max_speed: 0,
    device_watts: false,
    has_heartrate: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  console.log('📝 Activity details:');
  console.log(`  Name: ${yogaActivity.name}`);
  console.log(`  Type: ${yogaActivity.type}`);
  console.log(`  Duration: ${yogaActivity.moving_time / 60} minutes (${(yogaActivity.moving_time / 3600).toFixed(2)} hours)`);
  console.log(`  Date: ${yogaActivity.start_date_local}`);
  console.log(`  Manual: ${yogaActivity.manual}\n`);

  // Insert the activity
  const { error: insertError } = await supabase
    .from('strava_activities')
    .insert(yogaActivity);

  if (insertError) {
    console.error('❌ Failed to insert activity:', insertError.message);
    return;
  }

  console.log('✅ Activity created successfully!\n');

  // Calculate points
  console.log('📊 Calculating exercise points...');
  const { weekStart, weekEnd } = getWeekBoundaries(now);
  
  const { data: weekActivities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', userId)
    .gte('start_date', weekStart)
    .lte('start_date', weekEnd + 'T23:59:59')
    .is('deleted_at', null);

  const totalHours = weekActivities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
  const exercisePoints = Math.min(totalHours, 10);

  const { data: existingPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  await supabase
    .from('user_points')
    .upsert({
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      exercise_points: exercisePoints,
      habit_points: existingPoints?.habit_points || 0,
      badge_points: existingPoints?.badge_points || 0,
      total_hours: totalHours,
      activities_count: weekActivities.length,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,week_start'
    });

  console.log(`  Total hours this week: ${totalHours.toFixed(2)}`);
  console.log(`  Exercise points: ${exercisePoints.toFixed(2)}\n`);

  // Calculate Zen Master badge
  console.log('🏅 Calculating Zen Master badge...');
  
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  if (!badge) {
    console.error('Zen Master badge not found');
    return;
  }

  // Get all yoga activities for this week
  const { data: yogaActivities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', userId)
    .or('type.eq.Yoga,sport_type.eq.Yoga')
    .gte('start_date', weekStart)
    .lte('start_date', weekEnd + 'T23:59:59')
    .is('deleted_at', null);

  const totalYogaHours = yogaActivities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
  
  console.log(`  Total yoga hours this week: ${totalYogaHours.toFixed(2)}`);
  console.log(`  Bronze threshold: ${badge.criteria.bronze} hour(s)`);
  console.log(`  Silver threshold: ${badge.criteria.silver} hour(s)`);
  console.log(`  Gold threshold: ${badge.criteria.gold} hour(s)\n`);

  // Check existing progress
  const { data: existingProgress } = await supabase
    .from('badge_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .eq('period_start', weekStart)
    .single();

  const progress = {
    user_id: userId,
    badge_id: badge.id,
    current_value: totalYogaHours,
    period_start: weekStart,
    period_end: weekEnd,
    bronze_achieved: totalYogaHours >= badge.criteria.bronze,
    silver_achieved: totalYogaHours >= badge.criteria.silver,
    gold_achieved: totalYogaHours >= badge.criteria.gold,
    last_updated: new Date().toISOString()
  };

  if (existingProgress) {
    await supabase
      .from('badge_progress')
      .update(progress)
      .eq('id', existingProgress.id);
  } else {
    await supabase
      .from('badge_progress')
      .insert(progress);
  }

  // Check if badge was earned
  if (progress.bronze_achieved) {
    console.log('🎉 BRONZE ZEN MASTER ACHIEVED!');
    
    // Check if already awarded
    const { data: existingBadge } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (!existingBadge) {
      await supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badge.id,
          tier: 'bronze',
          earned_at: new Date().toISOString()
        });

      // Update badge points
      const currentBadgePoints = existingPoints?.badge_points || 0;
      await supabase
        .from('user_points')
        .update({ 
          badge_points: currentBadgePoints + 3,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('week_start', weekStart);

      console.log('  Badge awarded and 3 points added!\n');
    } else {
      console.log('  Badge already awarded previously\n');
    }
  }

  // Show final status
  console.log('📈 Final Status:');
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  if (finalPoints) {
    console.log(`  Exercise points: ${finalPoints.exercise_points}`);
    console.log(`  Habit points: ${finalPoints.habit_points}`);
    console.log(`  Badge points: ${finalPoints.badge_points}`);
    console.log(`  Total: ${finalPoints.exercise_points + finalPoints.habit_points + finalPoints.badge_points}`);
  }

  console.log('\n✨ Test yoga activity created and processed successfully!');
  console.log('\n⚠️  Note: This is a TEST activity created directly in the database.');
  console.log('   It will appear on the leaderboard and stats page.');
}

createTestYoga().catch(console.error);