const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function processUnprocessedWebhooks() {
  console.log('🔄 Processing unprocessed webhook events...\n');

  // Get all unprocessed webhook events
  const { data: events, error } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return;
  }

  console.log(`Found ${events?.length || 0} unprocessed webhook events\n`);

  if (!events || events.length === 0) {
    return;
  }

  // Group events by owner_id to check connections
  const eventsByOwner = {};
  for (const event of events) {
    if (!eventsByOwner[event.owner_id]) {
      eventsByOwner[event.owner_id] = [];
    }
    eventsByOwner[event.owner_id].push(event);
  }

  console.log(`Events from ${Object.keys(eventsByOwner).length} different athletes:\n`);

  // Check which athletes have connections
  for (const [athleteId, athleteEvents] of Object.entries(eventsByOwner)) {
    console.log(`\nAthlete ID: ${athleteId}`);
    console.log(`  Events: ${athleteEvents.length}`);

    // Check if we have a connection for this athlete
    const { data: connection } = await supabase
      .from('strava_connections')
      .select('*, user_profiles(email)')
      .eq('strava_athlete_id', athleteId)
      .single();

    if (!connection) {
      console.log(`  ❌ No connection found for athlete ${athleteId}`);
      console.log(`     These ${athleteEvents.length} events cannot be processed`);
      
      // List the activities
      for (const event of athleteEvents) {
        console.log(`     - ${event.aspect_type} activity ${event.object_id} at ${event.created_at}`);
      }
      continue;
    }

    console.log(`  ✅ Connection found: ${connection.user_profiles?.email}`);
    console.log(`     User ID: ${connection.user_id}`);

    // Check token validity
    const expiresAt = typeof connection.expires_at === 'string' 
      ? new Date(connection.expires_at).getTime() / 1000 
      : connection.expires_at;
    const now = Date.now() / 1000;

    if (expiresAt <= now) {
      console.log(`  ⚠️  Token expired, refreshing...`);
      
      // Refresh token
      const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: connection.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        await supabase
          .from('strava_connections')
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.expires_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id);
        
        connection.access_token = tokenData.access_token;
        console.log(`  ✅ Token refreshed successfully`);
      } else {
        console.log(`  ❌ Failed to refresh token`);
        continue;
      }
    }

    // Process events for this athlete
    console.log(`  Processing ${athleteEvents.length} events...`);
    
    for (const event of athleteEvents) {
      if (event.object_type !== 'activity') {
        console.log(`     Skipping non-activity event: ${event.object_type}`);
        continue;
      }

      console.log(`     Processing ${event.aspect_type} for activity ${event.object_id}...`);

      if (event.aspect_type === 'create' || event.aspect_type === 'update') {
        // Fetch activity from Strava
        const activityResponse = await fetch(
          `https://www.strava.com/api/v3/activities/${event.object_id}`,
          {
            headers: {
              'Authorization': `Bearer ${connection.access_token}`
            }
          }
        );

        if (activityResponse.ok) {
          const activity = await activityResponse.json();
          
          // Store in database
          const { error: upsertError } = await supabase
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

          if (upsertError) {
            console.log(`       ❌ Failed to store: ${upsertError.message}`);
          } else {
            console.log(`       ✅ Activity stored: ${activity.name}`);
          }
        } else {
          console.log(`       ❌ Failed to fetch from Strava: ${activityResponse.status}`);
        }
      } else if (event.aspect_type === 'delete') {
        // Soft delete
        await supabase
          .from('strava_activities')
          .update({ deleted_at: new Date().toISOString() })
          .eq('strava_activity_id', event.object_id);
        
        console.log(`       ✅ Activity ${event.object_id} marked as deleted`);
      }

      // Mark as processed
      await supabase
        .from('strava_webhook_events')
        .update({ 
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('id', event.id);
    }
  }

  console.log('\n✅ Webhook processing complete');
}

processUnprocessedWebhooks().catch(console.error);