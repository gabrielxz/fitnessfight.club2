const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllWebhooks() {
  console.log('🔔 Checking Webhook Subscriptions\n');
  console.log('=' .repeat(60) + '\n');

  // Check database webhook subscriptions
  console.log('📊 Database Webhook Subscriptions:');
  const { data: dbSubs } = await supabase
    .from('strava_webhook_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (dbSubs && dbSubs.length > 0) {
    for (const sub of dbSubs) {
      console.log(`\nSubscription ID: ${sub.subscription_id}`);
      console.log(`  Callback URL: ${sub.callback_url}`);
      console.log(`  Active: ${sub.active ? '✅' : '❌'}`);
      console.log(`  Created: ${sub.created_at}`);
    }
  } else {
    console.log('  ❌ No webhook subscriptions in database');
  }

  // Check all user connections
  console.log('\n\n👥 User Connections and Token Status:');
  console.log('-'.repeat(60));
  
  const { data: connections } = await supabase
    .from('strava_connections')
    .select('*, user_profiles(email)')
    .order('created_at', { ascending: false });

  if (connections && connections.length > 0) {
    for (const conn of connections) {
      const expiresAt = typeof conn.expires_at === 'string' 
        ? new Date(conn.expires_at).getTime() / 1000 
        : conn.expires_at;
      const now = Date.now() / 1000;
      const hoursUntilExpiry = (expiresAt - now) / 3600;
      
      console.log(`\n${conn.user_profiles?.email || 'Unknown user'}`);
      console.log(`  User ID: ${conn.user_id}`);
      console.log(`  Athlete ID: ${conn.athlete_id || 'NOT SET'}`);
      console.log(`  Token expires in: ${hoursUntilExpiry.toFixed(1)} hours`);
      console.log(`  Token status: ${hoursUntilExpiry > 0 ? '✅ Valid' : '❌ EXPIRED'}`);
      console.log(`  Last updated: ${conn.updated_at}`);
    }
  }

  // Check recent webhook events
  console.log('\n\n📬 Recent Webhook Events (last 24 hours):');
  console.log('-'.repeat(60));
  
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false })
    .limit(20);

  if (events && events.length > 0) {
    console.log(`Found ${events.length} webhook events:\n`);
    for (const event of events) {
      const time = new Date(event.created_at).toLocaleString();
      console.log(`${time} | ${event.aspect_type} ${event.object_type}`);
      console.log(`  Object ID: ${event.object_id} | Owner: ${event.owner_id}`);
      console.log(`  Processed: ${event.processed ? '✅' : '❌'}`);
    }
  } else {
    console.log('  No webhook events in the last 24 hours');
  }

  // Check with Strava API for actual subscription
  console.log('\n\n🌐 Checking with Strava API:');
  console.log('-'.repeat(60));
  
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  
  const response = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`
  );

  if (response.ok) {
    const subscriptions = await response.json();
    if (subscriptions.length > 0) {
      console.log('✅ Active Strava webhook subscriptions:');
      for (const sub of subscriptions) {
        console.log(`\n  Subscription ID: ${sub.id}`);
        console.log(`  Callback URL: ${sub.callback_url}`);
        console.log(`  Created: ${new Date(sub.created_at * 1000).toISOString()}`);
        console.log(`  Updated: ${new Date(sub.updated_at * 1000).toISOString()}`);
      }
    } else {
      console.log('❌ No active webhook subscriptions with Strava');
    }
  } else {
    console.log('❌ Failed to check Strava subscriptions:', await response.text());
  }

  // Summary
  console.log('\n\n📈 SUMMARY:');
  console.log('=' .repeat(60));
  
  const validTokens = connections?.filter(c => {
    const expiresAt = typeof c.expires_at === 'string' 
      ? new Date(c.expires_at).getTime() / 1000 
      : c.expires_at;
    return expiresAt > Date.now() / 1000;
  }).length || 0;

  console.log(`Total users: ${connections?.length || 0}`);
  console.log(`Valid tokens: ${validTokens}`);
  console.log(`Expired tokens: ${(connections?.length || 0) - validTokens}`);
  console.log(`Webhook events (24h): ${events?.length || 0}`);
}

checkAllWebhooks().catch(console.error);