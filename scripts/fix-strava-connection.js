const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stravaClientId = process.env.STRAVA_CLIENT_ID;
const stravaClientSecret = process.env.STRAVA_CLIENT_SECRET;

if (!supabaseUrl || !supabaseServiceKey || !stravaClientId || !stravaClientSecret) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function refreshStravaToken() {
  console.log('🔄 Refreshing Strava token...\n');

  // Get the most recent connection
  const { data: connection, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (connError || !connection) {
    console.error('❌ No Strava connection found');
    return null;
  }

  console.log(`Found connection for user: ${connection.user_id}`);
  console.log(`Refresh token: ${connection.refresh_token.substring(0, 10)}...`);

  // Refresh the token
  const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: stravaClientId,
      client_secret: stravaClientSecret,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });

  if (!tokenResponse.ok) {
    console.error('❌ Failed to refresh token:', await tokenResponse.text());
    return null;
  }

  const tokenData = await tokenResponse.json();
  console.log('✅ Token refreshed successfully');
  console.log(`  New access token: ${tokenData.access_token.substring(0, 10)}...`);
  console.log(`  Expires at: ${new Date(tokenData.expires_at * 1000).toISOString()}`);

  // Update the connection with the new tokens
  const { error: updateError } = await supabase
    .from('strava_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at, // Store as Unix timestamp
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  if (updateError) {
    console.error('❌ Failed to update connection:', updateError);
    return null;
  }

  console.log('✅ Connection updated in database\n');
  return tokenData.access_token;
}

async function createWebhookSubscription(accessToken) {
  console.log('🔔 Creating webhook subscription...\n');

  // First check if there's already an active subscription
  const { data: existingSub } = await supabase
    .from('strava_webhook_subscriptions')
    .select('*')
    .eq('active', true)
    .single();

  if (existingSub) {
    console.log('⚠️  Active subscription already exists');
    console.log(`  Subscription ID: ${existingSub.subscription_id}`);
    return existingSub.subscription_id;
  }

  // Create new subscription
  const callbackUrl = 'https://fitnessfight.club/api/strava/webhook';
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'fitnessfightclub2024';

  console.log(`Creating subscription with callback: ${callbackUrl}`);

  const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: stravaClientId,
      client_secret: stravaClientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to create subscription:', error);
    
    // If subscription already exists, try to get it
    if (error.includes('already exists')) {
      console.log('Fetching existing subscription...');
      const getResponse = await fetch(
        `https://www.strava.com/api/v3/push_subscriptions?client_id=${stravaClientId}&client_secret=${stravaClientSecret}`
      );
      
      if (getResponse.ok) {
        const data = await getResponse.json();
        if (data.length > 0) {
          const sub = data[0];
          console.log(`Found existing subscription: ${sub.id}`);
          
          // Save to database
          await supabase
            .from('strava_webhook_subscriptions')
            .insert({
              subscription_id: sub.id,
              callback_url: sub.callback_url,
              active: true,
              created_at: new Date().toISOString(),
            });
          
          return sub.id;
        }
      }
    }
    return null;
  }

  const subData = await response.json();
  console.log('✅ Webhook subscription created');
  console.log(`  Subscription ID: ${subData.id}`);

  // Save to database
  const { error: dbError } = await supabase
    .from('strava_webhook_subscriptions')
    .insert({
      subscription_id: subData.id,
      callback_url: callbackUrl,
      active: true,
      created_at: new Date().toISOString(),
    });

  if (dbError) {
    console.error('⚠️  Failed to save subscription to database:', dbError);
  }

  return subData.id;
}

async function syncRecentActivities(accessToken) {
  console.log('📥 Syncing recent activities...\n');

  // Get activities from the last 7 days
  const after = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  
  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error('❌ Failed to fetch activities:', await response.text());
    return;
  }

  const activities = await response.json();
  console.log(`Found ${activities.length} activities in the last 7 days`);

  // Get user connection with athlete_id
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('user_id, athlete_id')
    .eq('access_token', accessToken)
    .single();

  if (!connection) {
    console.error('❌ Connection not found');
    return;
  }

  let newCount = 0;
  let existingCount = 0;

  for (const activity of activities) {
    // Check if activity already exists
    const { data: existing } = await supabase
      .from('strava_activities')
      .select('id')
      .eq('strava_activity_id', activity.id)
      .single();

    if (existing) {
      existingCount++;
      continue;
    }

    // Insert new activity
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
      console.error(`  ❌ Failed to insert ${activity.name}:`, insertError.message);
    } else {
      console.log(`  ✅ Added: ${activity.name} (${activity.type})`);
      newCount++;
    }
  }

  console.log(`\n📊 Sync complete:`);
  console.log(`  ${newCount} new activities added`);
  console.log(`  ${existingCount} activities already existed`);

  return newCount;
}

async function main() {
  console.log('🚀 Fixing Strava connection and syncing activities\n');
  console.log('=' .repeat(60) + '\n');

  // Step 1: Refresh token
  const accessToken = await refreshStravaToken();
  if (!accessToken) {
    console.error('Failed to refresh token. Exiting.');
    process.exit(1);
  }

  // Step 2: Create webhook subscription
  const subscriptionId = await createWebhookSubscription(accessToken);
  if (!subscriptionId) {
    console.log('⚠️  Webhook subscription failed, but continuing with sync...\n');
  }

  // Step 3: Sync recent activities
  const newActivities = await syncRecentActivities(accessToken);

  // Step 4: If we added new activities, trigger point and badge calculations
  if (newActivities > 0) {
    console.log('\n🏅 Triggering badge calculations...');
    const { exec } = require('child_process');
    exec('node scripts/calculate-badges-properly.js', (error, stdout, stderr) => {
      if (error) {
        console.error('Badge calculation failed:', error);
      } else {
        console.log('Badge calculation output:', stdout);
      }
    });
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✨ Connection fix complete!');
}

main().catch(console.error);