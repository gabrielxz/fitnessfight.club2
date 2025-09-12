const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkGabrielConnection() {
  console.log('🔍 Checking Gabriel\'s Connection and Webhook Issues\n');
  console.log('=' .repeat(60) + '\n');

  // Get Gabriel's user profile
  const { data: gabriel } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', 'gabrielbeal@gmail.com')
    .single();

  if (!gabriel) {
    console.error('Gabriel not found');
    return;
  }

  console.log('👤 Gabriel\'s Profile:');
  console.log(`  User ID: ${gabriel.id}`);
  console.log(`  Email: ${gabriel.email}\n`);

  // Get Strava connection
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', gabriel.id)
    .single();

  if (!connection) {
    console.log('❌ No Strava connection found for Gabriel!');
    return;
  }

  console.log('🔗 Strava Connection:');
  console.log(`  Connection ID: ${connection.id}`);
  console.log(`  Athlete ID: ${connection.athlete_id || 'NOT SET'}`);
  console.log(`  Strava Athlete ID: ${connection.strava_athlete_id || 'NOT SET'}`);
  
  const expiresAt = typeof connection.expires_at === 'string' 
    ? new Date(connection.expires_at).getTime() / 1000 
    : connection.expires_at;
  const hoursUntilExpiry = (expiresAt - Date.now() / 1000) / 3600;
  
  console.log(`  Token expires in: ${hoursUntilExpiry.toFixed(1)} hours`);
  console.log(`  Token status: ${hoursUntilExpiry > 0 ? '✅ Valid' : '❌ EXPIRED'}`);
  console.log(`  Created: ${connection.created_at}`);
  console.log(`  Updated: ${connection.updated_at}\n`);

  // Check for webhook events from Gabriel's athlete ID
  if (connection.athlete_id || connection.strava_athlete_id) {
    const athleteId = connection.athlete_id || connection.strava_athlete_id;
    
    console.log(`📬 Webhook Events for Athlete ${athleteId}:`);
    const { data: events } = await supabase
      .from('strava_webhook_events')
      .select('*')
      .eq('owner_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (events && events.length > 0) {
      console.log(`  Found ${events.length} events:\n`);
      for (const event of events) {
        console.log(`  ${event.created_at} - ${event.aspect_type} ${event.object_type} ${event.object_id}`);
        console.log(`    Processed: ${event.processed ? '✅' : '❌'}`);
      }
    } else {
      console.log('  No webhook events found for this athlete ID');
    }
  }

  // Check manual activities
  console.log('\n\n📝 Manual Activities Created Today:');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: manualActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', gabriel.id)
    .eq('manual', true)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  if (manualActivities && manualActivities.length > 0) {
    for (const act of manualActivities) {
      console.log(`  - ${act.name} (${act.type})`);
      console.log(`    ID: ${act.strava_activity_id}`);
      console.log(`    Created: ${act.created_at}`);
    }
  } else {
    console.log('  No manual activities created today');
  }

  // The Problem
  console.log('\n\n❗ THE PROBLEM:');
  console.log('=' .repeat(60));
  
  if (!connection.athlete_id && !connection.strava_athlete_id) {
    console.log('🔴 Gabriel\'s connection has NO athlete_id set!');
    console.log('   This means webhook events cannot be matched to his account.');
    console.log('   Webhook events are coming in with owner_id (athlete ID)');
    console.log('   but we can\'t match them without the athlete_id in the connection.\n');
    
    console.log('💡 SOLUTION:');
    console.log('   1. Get Gabriel\'s Strava athlete ID from the API');
    console.log('   2. Update the strava_connections table');
    console.log('   3. Process the unmatched webhook events');
  } else {
    console.log('✅ Athlete ID is set: ' + (connection.athlete_id || connection.strava_athlete_id));
  }

  // Check webhook subscription
  console.log('\n\n🔔 Webhook Subscription:');
  const { data: sub } = await supabase
    .from('strava_webhook_subscriptions')
    .select('*')
    .eq('active', true)
    .single();

  if (sub) {
    console.log('  ✅ Active subscription exists in database');
  } else {
    console.log('  ❌ No active subscription in database');
    console.log('     BUT webhook events ARE being received!');
    console.log('     The subscription exists at Strava but not in our DB.');
  }

  // Check the actual webhook subscription with Strava
  console.log('\n  Checking with Strava API...');
  const response = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`
  );

  if (response.ok) {
    const subs = await response.json();
    if (subs.length > 0) {
      console.log(`  ✅ Webhook subscription exists at Strava:`);
      console.log(`     ID: ${subs[0].id}`);
      console.log(`     Callback: ${subs[0].callback_url}`);
    }
  }
}

checkGabrielConnection().catch(console.error);