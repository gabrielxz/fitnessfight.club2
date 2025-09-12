const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncFakeYoga() {
  console.log('🧘 Looking for fake yoga activity...\n');

  // Get the latest connection with valid token
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!connection) {
    console.error('No Strava connection found');
    return;
  }

  const accessToken = connection.access_token;
  console.log(`Using access token: ${accessToken.substring(0, 10)}...`);

  // Fetch ALL recent activities (last 24 hours)
  const after = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  console.log(`Fetching activities after: ${new Date(after * 1000).toISOString()}\n`);

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch activities:', await response.text());
    return;
  }

  const activities = await response.json();
  console.log(`Found ${activities.length} activities from Strava:\n`);

  // Look for yoga activities
  const yogaActivities = activities.filter(a => 
    a.type === 'Yoga' || 
    a.sport_type === 'Yoga' || 
    a.name.toLowerCase().includes('yoga')
  );

  if (yogaActivities.length === 0) {
    console.log('❌ No yoga activities found in Strava');
    console.log('\nAll activities:');
    activities.forEach(a => {
      console.log(`  - ${a.name} (${a.type}/${a.sport_type}) - ${a.start_date_local}`);
    });
    return;
  }

  console.log(`Found ${yogaActivities.length} yoga activities:`);
  
  for (const activity of yogaActivities) {
    console.log(`\n📍 ${activity.name}`);
    console.log(`   ID: ${activity.id}`);
    console.log(`   Type: ${activity.type} / Sport: ${activity.sport_type}`);
    console.log(`   Date: ${activity.start_date_local}`);
    console.log(`   Duration: ${(activity.moving_time / 60).toFixed(0)} minutes`);
    console.log(`   Manual: ${activity.manual}`);

    // Check if it exists in database
    const { data: existing } = await supabase
      .from('strava_activities')
      .select('id')
      .eq('strava_activity_id', activity.id)
      .single();

    if (existing) {
      console.log('   ✅ Already in database');
      continue;
    }

    // Insert the activity
    console.log('   ⏳ Adding to database...');
    
    const activityData = {
      user_id: connection.user_id,
      strava_athlete_id: connection.athlete_id,
      strava_activity_id: activity.id,
      name: activity.name,
      type: activity.type || activity.sport_type,
      sport_type: activity.sport_type || activity.type,
      start_date: activity.start_date,
      start_date_local: activity.start_date_local,
      timezone: activity.timezone,
      distance: activity.distance || 0,
      moving_time: activity.moving_time || 0,
      elapsed_time: activity.elapsed_time || 0,
      total_elevation_gain: activity.total_elevation_gain || 0,
      achievement_count: activity.achievement_count || 0,
      kudos_count: activity.kudos_count || 0,
      comment_count: activity.comment_count || 0,
      athlete_count: activity.athlete_count || 1,
      photo_count: activity.photo_count || 0,
      trainer: activity.trainer || false,
      commute: activity.commute || false,
      manual: activity.manual || false,
      private: activity.private || false,
      average_speed: activity.average_speed || 0,
      max_speed: activity.max_speed || 0,
      average_cadence: activity.average_cadence,
      average_watts: activity.average_watts,
      kilojoules: activity.kilojoules,
      device_watts: activity.device_watts || false,
      has_heartrate: activity.has_heartrate || false,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      suffer_score: activity.suffer_score,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('strava_activities')
      .insert(activityData);

    if (insertError) {
      console.error(`   ❌ Failed to insert:`, insertError.message);
    } else {
      console.log(`   ✅ Added to database!`);
      
      // Calculate points for this activity
      console.log('   📊 Calculating points...');
      await calculatePointsForActivity(activityData);
      
      // Calculate badges
      console.log('   🏅 Calculating badges...');
      await calculateBadgesForYoga(activityData);
    }
  }
}

async function calculatePointsForActivity(activity) {
  const weekStart = getWeekStart(new Date(activity.start_date_local));
  
  // Get all activities for this week
  const { data: weekActivities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', activity.user_id)
    .gte('start_date', weekStart)
    .lte('start_date', getWeekEnd(weekStart) + 'T23:59:59')
    .is('deleted_at', null);

  const totalHours = weekActivities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
  const exercisePoints = Math.min(totalHours, 10);

  // Update user_points
  const { data: existing } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', activity.user_id)
    .eq('week_start', weekStart)
    .single();

  const pointsData = {
    user_id: activity.user_id,
    week_start: weekStart,
    week_end: getWeekEnd(weekStart),
    exercise_points: exercisePoints,
    habit_points: existing?.habit_points || 0,
    badge_points: existing?.badge_points || 0,
    total_hours: totalHours,
    activities_count: weekActivities.length,
    updated_at: new Date().toISOString()
  };

  await supabase
    .from('user_points')
    .upsert(pointsData, {
      onConflict: 'user_id,week_start'
    });

  console.log(`      Exercise points: ${exercisePoints.toFixed(2)}`);
  console.log(`      Total hours: ${totalHours.toFixed(2)}`);
}

async function calculateBadgesForYoga(activity) {
  // Get Zen Master badge
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  if (!badge) {
    console.log('      ❌ Zen Master badge not found');
    return;
  }

  const weekStart = getWeekStart(new Date(activity.start_date_local));
  
  // Get all yoga activities for this week
  const { data: yogaActivities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', activity.user_id)
    .or('type.eq.Yoga,sport_type.eq.Yoga')
    .gte('start_date', weekStart)
    .lte('start_date', getWeekEnd(weekStart) + 'T23:59:59')
    .is('deleted_at', null);

  const totalYogaHours = yogaActivities.reduce((sum, a) => sum + (a.moving_time / 3600), 0);
  
  console.log(`      Total yoga hours this week: ${totalYogaHours.toFixed(2)}`);
  console.log(`      Bronze threshold: ${badge.criteria.bronze} hour(s)`);

  // Check if record exists
  const { data: existing } = await supabase
    .from('badge_progress')
    .select('*')
    .eq('user_id', activity.user_id)
    .eq('badge_id', badge.id)
    .eq('period_start', weekStart)
    .single();

  const progress = {
    user_id: activity.user_id,
    badge_id: badge.id,
    current_value: totalYogaHours,
    period_start: weekStart,
    period_end: getWeekEnd(weekStart),
    bronze_achieved: totalYogaHours >= badge.criteria.bronze,
    silver_achieved: totalYogaHours >= badge.criteria.silver,
    gold_achieved: totalYogaHours >= badge.criteria.gold,
    last_updated: new Date().toISOString()
  };

  if (existing) {
    await supabase
      .from('badge_progress')
      .update(progress)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('badge_progress')
      .insert(progress);
  }

  // Check if we earned a tier
  if (!existing?.bronze_achieved && progress.bronze_achieved) {
    console.log('      🎉 EARNED BRONZE ZEN MASTER!');
    await awardBadge(activity.user_id, badge.id, 'bronze');
  } else if (!existing?.silver_achieved && progress.silver_achieved) {
    console.log('      🎉 EARNED SILVER ZEN MASTER!');
    await awardBadge(activity.user_id, badge.id, 'silver');
  } else if (!existing?.gold_achieved && progress.gold_achieved) {
    console.log('      🎉 EARNED GOLD ZEN MASTER!');
    await awardBadge(activity.user_id, badge.id, 'gold');
  }
}

async function awardBadge(userId, badgeId, tier) {
  const { data: existing } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .single();

  if (!existing) {
    await supabase
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badgeId,
        tier: tier,
        earned_at: new Date().toISOString()
      });

    // Update badge points
    const points = tier === 'gold' ? 15 : tier === 'silver' ? 6 : 3;
    const weekStart = getWeekStart(new Date());
    
    const { data: currentPoints } = await supabase
      .from('user_points')
      .select('badge_points')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .single();

    await supabase
      .from('user_points')
      .update({ 
        badge_points: (currentPoints?.badge_points || 0) + points 
      })
      .eq('user_id', userId)
      .eq('week_start', weekStart);
      
    console.log(`      Added ${points} badge points`);
  }
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

syncFakeYoga().catch(console.error);