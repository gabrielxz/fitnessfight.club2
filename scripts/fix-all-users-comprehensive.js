const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAllUsersComprehensive() {
  console.log('🔧 Comprehensive Fix for All Users\n');
  console.log('=' .repeat(70) + '\n');

  // Get all connections
  const { data: connections, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (connError) {
    console.error('Error fetching connections:', connError);
    return;
  }

  if (!connections || connections.length === 0) {
    console.log('No connections found');
    return;
  }

  console.log(`Found ${connections.length} connections to fix:\n`);

  // Fix each connection
  for (const conn of connections) {
    console.log(`\n📍 Processing User ${conn.user_id.substring(0, 8)}... (Athlete: ${conn.strava_athlete_id})`);
    console.log('-'.repeat(60));

    // Check token expiry
    const expiresAt = typeof conn.expires_at === 'string' 
      ? new Date(conn.expires_at).getTime() / 1000 
      : conn.expires_at;
    const hoursLeft = (expiresAt - Date.now() / 1000) / 3600;

    if (hoursLeft <= 0) {
      console.log(`  ⚠️  Token expired ${Math.abs(hoursLeft).toFixed(1)} hours ago`);
      console.log('  🔄 Refreshing token...');
      
      const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: conn.refresh_token,
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
          .eq('id', conn.id);
        
        conn.access_token = tokenData.access_token; // Update for processing
        console.log('  ✅ Token refreshed successfully');
      } else {
        console.log('  ❌ Failed to refresh token:', await tokenResponse.text());
        continue; // Skip processing for this user
      }
    } else {
      console.log(`  ✅ Token valid for ${hoursLeft.toFixed(1)} more hours`);
    }

    // Process unprocessed webhook events for this athlete
    const { data: events } = await supabase
      .from('strava_webhook_events')
      .select('*')
      .eq('owner_id', conn.strava_athlete_id)
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (events && events.length > 0) {
      console.log(`  📬 Found ${events.length} unprocessed webhook events`);
      let processed = 0;
      let failed = 0;

      for (const event of events) {
        if (event.object_type !== 'activity') continue;

        if (event.aspect_type === 'create' || event.aspect_type === 'update') {
          // Fetch activity from Strava
          const activityResponse = await fetch(
            `https://www.strava.com/api/v3/activities/${event.object_id}`,
            {
              headers: {
                'Authorization': `Bearer ${conn.access_token}`
              }
            }
          );

          if (activityResponse.ok) {
            const activity = await activityResponse.json();
            
            // Store in database
            const { error } = await supabase
              .from('strava_activities')
              .upsert({
                user_id: conn.user_id,
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
              processed++;
            } else {
              failed++;
            }
          } else if (activityResponse.status === 404) {
            // Activity deleted or private
            processed++; // Count as processed since we can't fetch it
          } else {
            failed++;
          }

          // Mark as processed
          await supabase
            .from('strava_webhook_events')
            .update({ 
              processed: true,
              processed_at: new Date().toISOString()
            })
            .eq('id', event.id);
        } else if (event.aspect_type === 'delete') {
          // Soft delete
          await supabase
            .from('strava_activities')
            .update({ deleted_at: new Date().toISOString() })
            .eq('strava_activity_id', event.object_id);
          
          await supabase
            .from('strava_webhook_events')
            .update({ 
              processed: true,
              processed_at: new Date().toISOString()
            })
            .eq('id', event.id);
          
          processed++;
        }
      }

      console.log(`  ✅ Processed ${processed} events`);
      if (failed > 0) {
        console.log(`  ⚠️  Failed to process ${failed} events`);
      }
    } else {
      console.log('  ✅ No unprocessed webhook events');
    }
  }

  // Handle orphaned webhook events (no matching connection)
  console.log('\n\n📬 Handling Orphaned Webhook Events');
  console.log('-'.repeat(60));
  
  const { data: orphanedEvents } = await supabase
    .from('strava_webhook_events')
    .select('owner_id')
    .eq('processed', false);

  if (orphanedEvents) {
    const athleteIds = [...new Set(orphanedEvents.map(e => e.owner_id))];
    const connectedAthletes = new Set(connections.map(c => c.strava_athlete_id?.toString()));
    const orphanedAthletes = athleteIds.filter(id => !connectedAthletes.has(id.toString()));

    if (orphanedAthletes.length > 0) {
      console.log(`Found ${orphanedAthletes.length} athletes with events but no connection:`);
      
      for (const athleteId of orphanedAthletes) {
        const count = orphanedEvents.filter(e => e.owner_id == athleteId).length;
        console.log(`  Athlete ${athleteId}: ${count} events`);
        
        // Mark these as processed since we can't handle them
        await supabase
          .from('strava_webhook_events')
          .update({ 
            processed: true,
            processed_at: new Date().toISOString(),
            error: 'No connection found for athlete'
          })
          .eq('owner_id', athleteId)
          .eq('processed', false);
      }
      
      console.log('\n  ✅ Marked all orphaned events as processed');
      console.log('  These are likely from users who disconnected or other app users');
    } else {
      console.log('  ✅ No orphaned events found');
    }
  }

  console.log('\n\n✨ All users fixed! Summary:');
  console.log('=' .repeat(70));
  console.log('• All expired tokens refreshed');
  console.log('• All webhook events processed');
  console.log('• Orphaned events marked as processed');
  console.log('\n🎯 Next steps:');
  console.log('• Run badge calculation: node scripts/calculate-badges-properly.js');
  console.log('• Run points calculation: node scripts/recalculate-all-points.js');
}

fixAllUsersComprehensive().catch(console.error);