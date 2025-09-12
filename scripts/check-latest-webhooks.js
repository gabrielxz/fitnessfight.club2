const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLatestWebhooks() {
  console.log('🔍 Checking for "fake yoga 2" webhook...\n');
  console.log('=' .repeat(60) + '\n');

  // Get Gabriel's athlete ID
  const { data: conn } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', '6ff52889-f6b0-4403-8a48-3f7e4b2195ce')
    .single();

  if (!conn) {
    console.error('Gabriel\'s connection not found');
    return;
  }

  const athleteId = conn.strava_athlete_id;
  console.log(`Gabriel\'s Athlete ID: ${athleteId}\n`);

  // Check recent webhook events (last 30 minutes)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  console.log('📬 Recent webhook events (last 30 minutes):');
  console.log('-'.repeat(60));
  
  const { data: recentEvents } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .gte('created_at', thirtyMinutesAgo)
    .order('created_at', { ascending: false });

  if (recentEvents && recentEvents.length > 0) {
    console.log(`Found ${recentEvents.length} webhook events:\n`);
    
    for (const event of recentEvents) {
      const isGabriel = event.owner_id == athleteId ? '👤 GABRIEL' : '';
      console.log(`${event.created_at} | ${event.aspect_type} ${event.object_type} ${event.object_id}`);
      console.log(`  Owner: ${event.owner_id} ${isGabriel}`);
      console.log(`  Processed: ${event.processed ? '✅' : '❌'}`);
      console.log('');
    }

    // Check specifically for Gabriel's events
    const gabrielEvents = recentEvents.filter(e => e.owner_id == athleteId);
    if (gabrielEvents.length > 0) {
      console.log(`\n✅ Found ${gabrielEvents.length} events for Gabriel`);
    } else {
      console.log('\n❌ No recent webhook events for Gabriel');
      console.log('   The webhook may not have been sent or received');
    }
  } else {
    console.log('❌ No webhook events in the last 30 minutes');
  }

  // Check for activities with "yoga" in the name
  console.log('\n\n🧘 Recent activities with "yoga" in name:');
  console.log('-'.repeat(60));
  
  const { data: yogaActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', conn.user_id)
    .ilike('name', '%yoga%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (yogaActivities && yogaActivities.length > 0) {
    for (const act of yogaActivities) {
      console.log(`${act.name} (ID: ${act.strava_activity_id})`);
      console.log(`  Created: ${act.created_at}`);
      console.log(`  Type: ${act.type} / Sport: ${act.sport_type}`);
      console.log('');
    }
  } else {
    console.log('No yoga activities found');
  }

  // Check token status
  console.log('\n\n🔐 Token Status:');
  console.log('-'.repeat(60));
  const expiresAt = typeof conn.expires_at === 'string' 
    ? new Date(conn.expires_at).getTime() / 1000 
    : conn.expires_at;
  const hoursLeft = (expiresAt - Date.now() / 1000) / 3600;
  
  console.log(`Token expires in: ${hoursLeft.toFixed(1)} hours`);
  console.log(`Token status: ${hoursLeft > 0 ? '✅ Valid' : '❌ EXPIRED'}`);
  console.log(`Last updated: ${conn.updated_at}`);

  // Try to fetch from Strava API directly
  console.log('\n\n🌐 Fetching recent activities from Strava API:');
  console.log('-'.repeat(60));
  
  const accessToken = conn.access_token;
  const after = Math.floor((Date.now() - 60 * 60 * 1000) / 1000); // Last hour
  
  try {
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=10`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (response.ok) {
      const activities = await response.json();
      console.log(`Found ${activities.length} activities in Strava:\n`);
      
      for (const act of activities) {
        const date = new Date(act.start_date_local);
        console.log(`${act.name} (ID: ${act.id})`);
        console.log(`  Type: ${act.type} / Sport: ${act.sport_type}`);
        console.log(`  Date: ${date.toLocaleString()}`);
        console.log(`  Manual: ${act.manual}`);
        console.log('');
      }

      // Check if "fake yoga 2" is there
      const fakeYoga2 = activities.find(a => a.name.toLowerCase().includes('fake yoga 2'));
      if (fakeYoga2) {
        console.log('✅ "fake yoga 2" found in Strava!');
        console.log(`   Activity ID: ${fakeYoga2.id}`);
        console.log(`   But it\'s not in our database yet`);
      } else {
        console.log('❌ "fake yoga 2" not found in Strava API');
        console.log('   It may not have been created or may be deleted');
      }
    } else {
      console.error('Failed to fetch from Strava:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Error fetching from Strava:', error);
  }

  // Summary
  console.log('\n\n📊 SUMMARY:');
  console.log('=' .repeat(60));
  
  if (recentEvents && recentEvents.filter(e => e.owner_id == athleteId).length === 0) {
    console.log('❌ No webhook received for "fake yoga 2"');
    console.log('\nPossible reasons:');
    console.log('1. Webhook endpoint is not deployed to production');
    console.log('2. Webhook subscription is not working');
    console.log('3. Strava didn\'t send the webhook yet (sometimes delayed)');
    console.log('4. The activity wasn\'t actually created in Strava');
  }
}

checkLatestWebhooks().catch(console.error);