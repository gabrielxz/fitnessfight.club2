const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function manualSync() {
  console.log('Starting manual sync...\n');

  // Get your user ID (Gabriel)
  const { data: users, error: userError } = await supabase
    .from('user_profiles')
    .select('id, email, full_name')
    .eq('email', 'gabrielbeal@gmail.com')
    .single();

  if (userError || !users) {
    console.error('Could not find user:', userError);
    return;
  }

  const userId = users.id;
  console.log(`Found user: ${users.full_name} (${userId})\n`);

  // Get Strava connection
  const { data: connection, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (connError || !connection) {
    console.error('No Strava connection found:', connError);
    return;
  }

  console.log(`Strava athlete ID: ${connection.strava_athlete_id}`);
  console.log(`Token expires: ${new Date(connection.expires_at * 1000).toLocaleString()}\n`);

  // Check if token needs refresh
  const now = Math.floor(Date.now() / 1000);
  let accessToken = connection.access_token;
  
  if (connection.expires_at <= now) {
    console.log('Token expired, refreshing...');
    
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      console.error('Failed to refresh token');
      return;
    }

    const newTokens = await response.json();
    accessToken = newTokens.access_token;
    
    // Update tokens in database
    await supabase
      .from('strava_connections')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newTokens.expires_at
      })
      .eq('user_id', userId);
      
    console.log('Token refreshed successfully\n');
  }

  // Fetch recent activities from Strava
  console.log('Fetching activities from Strava...');
  const activitiesResponse = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=10',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!activitiesResponse.ok) {
    console.error('Failed to fetch activities:', activitiesResponse.status);
    return;
  }

  const activities = await activitiesResponse.json();
  console.log(`Found ${activities.length} recent activities\n`);

  // Store each activity
  for (const activity of activities) {
    console.log(`Processing: ${activity.name} (${activity.type})`);
    
    const { error } = await supabase
      .from('strava_activities')
      .upsert({
        user_id: userId,
        strava_activity_id: activity.id,
        strava_athlete_id: activity.athlete.id,
        name: activity.name,
        distance: activity.distance,
        moving_time: activity.moving_time,
        elapsed_time: activity.elapsed_time,
        total_elevation_gain: activity.total_elevation_gain,
        type: activity.type,
        sport_type: activity.sport_type,
        start_date: activity.start_date,
        start_date_local: activity.start_date_local,
        timezone: activity.timezone,
        achievement_count: activity.achievement_count,
        kudos_count: activity.kudos_count,
        comment_count: activity.comment_count,
        athlete_count: activity.athlete_count,
        photo_count: activity.photo_count,
        trainer: activity.trainer,
        commute: activity.commute,
        manual: activity.manual,
        private: activity.private,
        visibility: activity.visibility,
        flagged: activity.flagged,
        average_speed: activity.average_speed,
        max_speed: activity.max_speed,
        average_cadence: activity.average_cadence,
        average_heartrate: activity.average_heartrate,
        max_heartrate: activity.max_heartrate,
        average_watts: activity.average_watts,
        kilojoules: activity.kilojoules,
        device_watts: activity.device_watts,
        has_heartrate: activity.has_heartrate,
        calories: activity.calories,
        suffer_score: activity.suffer_score,
        deleted_at: null
      }, {
        onConflict: 'strava_activity_id'
      });

    if (error) {
      console.error(`  Error: ${error.message}`);
    } else {
      console.log(`  ✓ Stored successfully`);
    }
  }

  console.log('\n✅ Sync complete!');
}

manualSync();