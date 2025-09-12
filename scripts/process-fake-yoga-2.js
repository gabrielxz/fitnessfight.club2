const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function processFakeYoga2() {
  console.log('🧘 Processing "fake yoga 2" webhook...\n');
  
  // Get the unprocessed webhook event
  const { data: webhookEvent } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .eq('object_id', '15789729744')
    .eq('owner_id', '22415995')
    .single();

  if (!webhookEvent) {
    console.error('Webhook event not found');
    return;
  }

  console.log('📬 Webhook Event Found:');
  console.log(`  ID: ${webhookEvent.id}`);
  console.log(`  Activity ID: ${webhookEvent.object_id}`);
  console.log(`  Owner: ${webhookEvent.owner_id}`);
  console.log(`  Type: ${webhookEvent.aspect_type}`);
  console.log(`  Created: ${webhookEvent.created_at}`);
  console.log(`  Processed: ${webhookEvent.processed ? '✅' : '❌'}\n`);

  // Get Gabriel's connection
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('strava_athlete_id', '22415995')
    .single();

  if (!connection) {
    console.error('Connection not found for athlete 22415995');
    return;
  }

  console.log('🔗 Connection:');
  console.log(`  User ID: ${connection.user_id}`);
  console.log(`  Token expires in: ${((connection.expires_at - Date.now() / 1000) / 3600).toFixed(1)} hours\n`);

  // Try to fetch the activity from Strava
  console.log('🌐 Fetching activity from Strava API...');
  
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${webhookEvent.object_id}`,
    {
      headers: {
        'Authorization': `Bearer ${connection.access_token}`
      }
    }
  );

  console.log(`  Response status: ${response.status} ${response.statusText}\n`);

  if (!response.ok) {
    if (response.status === 404) {
      console.log('❌ Activity not found in Strava (404)');
      console.log('   Possible reasons:');
      console.log('   1. Activity was deleted');
      console.log('   2. Activity is private');
      console.log('   3. Wrong activity ID\n');
      
      // Try to search for it by fetching recent activities
      console.log('🔍 Searching for recent activities...');
      const searchResponse = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000)}&per_page=20`,
        {
          headers: {
            'Authorization': `Bearer ${connection.access_token}`
          }
        }
      );

      if (searchResponse.ok) {
        const activities = await searchResponse.json();
        console.log(`  Found ${activities.length} activities in last 2 hours:\n`);
        
        for (const act of activities) {
          console.log(`  - ${act.name} (ID: ${act.id})`);
          console.log(`    Type: ${act.type}, Manual: ${act.manual}`);
          
          if (act.name.toLowerCase().includes('yoga')) {
            console.log(`    🧘 This is a yoga activity!`);
          }
        }
        
        // Check if any have a similar ID
        const similarActivity = activities.find(a => Math.abs(a.id - webhookEvent.object_id) < 100);
        if (similarActivity) {
          console.log(`\n  💡 Found similar activity ID: ${similarActivity.id} (${similarActivity.name})`);
          console.log(`     The webhook may have the wrong activity ID`);
        }
      }
    } else if (response.status === 401) {
      console.log('❌ Authentication failed (401)');
      console.log('   Token may be invalid or expired');
    } else {
      console.log(`❌ Failed to fetch: ${await response.text()}`);
    }
    
    // Mark webhook as processed with error
    await supabase
      .from('strava_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: `Failed to fetch: ${response.status}`
      })
      .eq('id', webhookEvent.id);
    
    return;
  }

  const activity = await response.json();
  console.log('✅ Activity fetched successfully!');
  console.log(`  Name: ${activity.name}`);
  console.log(`  Type: ${activity.type} / Sport: ${activity.sport_type}`);
  console.log(`  Duration: ${(activity.moving_time / 60).toFixed(0)} minutes`);
  console.log(`  Manual: ${activity.manual}\n`);

  // Store in database
  console.log('💾 Storing activity in database...');
  
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

  if (error) {
    console.error('❌ Failed to store activity:', error);
  } else {
    console.log('✅ Activity stored successfully!');
    
    // Mark webhook as processed
    await supabase
      .from('strava_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', webhookEvent.id);
    
    console.log('✅ Webhook marked as processed');
    
    // Recalculate points
    console.log('\n📊 Recalculating points and badges...');
    console.log('   Run: node scripts/recalculate-all-points.js');
    console.log('   Run: node scripts/calculate-badges-properly.js');
  }
}

processFakeYoga2().catch(console.error);