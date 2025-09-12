const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncMissingActivities() {
  console.log('🔄 Syncing missing activities from Strava...\n');

  // Get connection
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

  // Fetch activities from last 7 days
  const after = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  
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
  console.log(`Found ${activities.length} activities in Strava\n`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const activity of activities) {
    // Check if exists
    const { data: existing } = await supabase
      .from('strava_activities')
      .select('id')
      .eq('strava_activity_id', activity.id)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    console.log(`📍 Syncing: ${activity.name} (${activity.type})`);

    const activityData = {
      user_id: connection.user_id,
      strava_athlete_id: connection.athlete_id || activity.athlete?.id,
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

    const { error } = await supabase
      .from('strava_activities')
      .insert(activityData);

    if (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Synced successfully`);
      synced++;
    }
  }

  console.log('\n📊 Sync Summary:');
  console.log(`  ✅ Synced: ${synced}`);
  console.log(`  ⏭️  Skipped (already exists): ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (synced > 0) {
    console.log('\n🏅 Recalculating points and badges...');
    const { exec } = require('child_process');
    
    // Calculate points
    exec('node scripts/recalculate-all-points.js', (error, stdout) => {
      if (!error) {
        console.log('Points recalculated');
      }
    });

    // Calculate badges
    exec('node scripts/calculate-badges-properly.js', (error, stdout) => {
      if (!error) {
        console.log('Badges recalculated');
      }
    });
  }
}

syncMissingActivities().catch(console.error);