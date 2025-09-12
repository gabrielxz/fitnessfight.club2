const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAllWebhookProcessing() {
  console.log('🔧 Fixing Webhook Processing for All Users\n');
  console.log('=' .repeat(60) + '\n');

  // Step 1: Fix Gabriel's connection first
  console.log('📍 Step 1: Fixing Gabriel\'s Connection...');
  
  const { data: gabriel } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', 'gabrielbeal@gmail.com')
    .single();

  if (gabriel) {
    const { data: gabrielConn } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', gabriel.id)
      .single();

    if (gabrielConn) {
      // Update athlete_id field if missing
      if (!gabrielConn.athlete_id && gabrielConn.strava_athlete_id) {
        await supabase
          .from('strava_connections')
          .update({ athlete_id: gabrielConn.strava_athlete_id })
          .eq('id', gabrielConn.id);
        console.log(`  ✅ Updated Gabriel's athlete_id to ${gabrielConn.strava_athlete_id}`);
      }

      // Refresh token if expired
      const expiresAt = typeof gabrielConn.expires_at === 'string' 
        ? new Date(gabrielConn.expires_at).getTime() / 1000 
        : gabrielConn.expires_at;
      
      if (expiresAt <= Date.now() / 1000) {
        console.log('  🔄 Refreshing Gabriel\'s token...');
        const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: gabrielConn.refresh_token,
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
            .eq('id', gabrielConn.id);
          console.log('  ✅ Token refreshed successfully');
        }
      }
    }
  }

  // Step 2: Save webhook subscription to database
  console.log('\n📍 Step 2: Saving Webhook Subscription...');
  
  const response = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`
  );

  if (response.ok) {
    const subs = await response.json();
    if (subs.length > 0) {
      const sub = subs[0];
      
      // Check if already in database
      const { data: existing } = await supabase
        .from('strava_webhook_subscriptions')
        .select('*')
        .eq('subscription_id', sub.id)
        .single();

      if (!existing) {
        await supabase
          .from('strava_webhook_subscriptions')
          .insert({
            subscription_id: sub.id,
            callback_url: sub.callback_url,
            active: true,
            created_at: new Date().toISOString()
          });
        console.log(`  ✅ Saved webhook subscription ${sub.id} to database`);
      } else {
        await supabase
          .from('strava_webhook_subscriptions')
          .update({ active: true })
          .eq('subscription_id', sub.id);
        console.log(`  ✅ Webhook subscription ${sub.id} already in database`);
      }
    }
  }

  // Step 3: Process Gabriel's unprocessed webhook events
  console.log('\n📍 Step 3: Processing Gabriel\'s Webhook Events...');
  
  const { data: gabrielEvents } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .eq('owner_id', '22415995') // Gabriel's athlete ID
    .eq('processed', false)
    .order('created_at', { ascending: true });

  if (gabrielEvents && gabrielEvents.length > 0) {
    console.log(`  Found ${gabrielEvents.length} unprocessed events for Gabriel`);
    
    // Get Gabriel's updated connection
    const { data: connection } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', gabriel.id)
      .single();

    let processed = 0;
    for (const event of gabrielEvents) {
      if (event.object_type !== 'activity') continue;
      
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
          const { error } = await supabase
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

          if (!error) {
            console.log(`    ✅ Processed: ${activity.name} (${activity.type})`);
            processed++;
            
            // Mark as processed
            await supabase
              .from('strava_webhook_events')
              .update({ 
                processed: true,
                processed_at: new Date().toISOString()
              })
              .eq('id', event.id);
          } else {
            console.log(`    ❌ Failed: ${error.message}`);
          }
        } else {
          console.log(`    ⚠️  Activity ${event.object_id} not found in Strava (may be deleted)`);
          // Still mark as processed to avoid retrying
          await supabase
            .from('strava_webhook_events')
            .update({ 
              processed: true,
              processed_at: new Date().toISOString()
            })
            .eq('id', event.id);
        }
      }
    }
    
    console.log(`  ✅ Processed ${processed} activities`);
  } else {
    console.log('  No unprocessed events for Gabriel');
  }

  // Step 4: Recalculate points and badges
  console.log('\n📍 Step 4: Recalculating Points and Badges...');
  
  const { exec } = require('child_process');
  
  // Recalculate all points
  exec('node scripts/recalculate-all-points.js', (error, stdout) => {
    if (!error) {
      console.log('  ✅ Points recalculated');
    }
  });

  // Calculate badges
  exec('node scripts/calculate-badges-properly.js', (error, stdout) => {
    if (!error) {
      console.log('  ✅ Badges recalculated');
    }
  });

  console.log('\n' + '=' .repeat(60));
  console.log('✨ Webhook processing fixed!\n');
  console.log('Your activities should now appear on the leaderboard.');
  console.log('Future activities will be processed automatically.');
}

fixAllWebhookProcessing().catch(console.error);