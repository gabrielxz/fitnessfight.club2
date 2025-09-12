const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function processLatestWebhook() {
  console.log('Processing latest webhook event...\n');

  // Get the latest unprocessed webhook event
  const { data: webhook, error } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .is('processed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !webhook) {
    console.log('No unprocessed webhooks found');
    return;
  }

  console.log(`Found webhook: ${webhook.aspect_type} ${webhook.object_type}`);
  console.log(`Activity ID: ${webhook.object_id}`);
  console.log(`Athlete ID: ${webhook.owner_id}`);
  console.log(`Event time: ${webhook.event_time}\n`);

  // Find the Strava connection for this athlete
  const { data: connection, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('strava_athlete_id', webhook.owner_id)
    .single();

  if (connError || !connection) {
    console.error('No connection found for athlete:', webhook.owner_id);
    return;
  }

  console.log(`Found connection for user: ${connection.user_id}`);
  
  // For testing, let's parse the expires_at properly
  const expiresAt = new Date(connection.expires_at).getTime() / 1000;
  const now = Math.floor(Date.now() / 1000);
  
  console.log(`Token expires: ${new Date(expiresAt * 1000).toLocaleString()}`);
  
  if (expiresAt <= now) {
    console.log('Token is expired, needs refresh\n');
    
    // Refresh the token
    console.log('Refreshing token...');
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
      console.error('Failed to refresh token:', response.status);
      return;
    }

    const newTokens = await response.json();
    
    // Update tokens - store expires_at as Unix timestamp
    await supabase
      .from('strava_connections')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newTokens.expires_at
      })
      .eq('user_id', connection.user_id);
    
    connection.access_token = newTokens.access_token;
    console.log('Token refreshed successfully\n');
  }

  // Fetch the activity details
  console.log(`Fetching activity ${webhook.object_id} from Strava...`);
  const activityResponse = await fetch(
    `https://www.strava.com/api/v3/activities/${webhook.object_id}`,
    {
      headers: {
        'Authorization': `Bearer ${connection.access_token}`
      }
    }
  );

  if (!activityResponse.ok) {
    console.error('Failed to fetch activity:', activityResponse.status);
    const errorText = await activityResponse.text();
    console.error('Error:', errorText);
    return;
  }

  const activity = await activityResponse.json();
  console.log(`Activity: ${activity.name}`);
  console.log(`Type: ${activity.type} / ${activity.sport_type}`);
  console.log(`Distance: ${(activity.distance / 1609.34).toFixed(2)} miles`);
  console.log(`Time: ${(activity.moving_time / 60).toFixed(0)} minutes\n`);

  // Store the activity
  console.log('Storing activity in database...');
  const { error: storeError } = await supabase
    .from('strava_activities')
    .upsert({
      user_id: connection.user_id,
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

  if (storeError) {
    console.error('Error storing activity:', storeError);
  } else {
    console.log('✅ Activity stored successfully!');
    
    // Mark webhook as processed
    await supabase
      .from('strava_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', webhook.id);
  }
}

processLatestWebhook();