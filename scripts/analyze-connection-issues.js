const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeConnectionIssues() {
  console.log('🔍 Analyzing Connection & Webhook Issues\n');
  console.log('=' .repeat(70) + '\n');

  // 1. Check all connections and their athlete IDs
  console.log('📊 1. ALL USER CONNECTIONS:\n');
  const { data: connections } = await supabase
    .from('strava_connections')
    .select('*, user_profiles(email)')
    .order('created_at', { ascending: true });

  const connectionsByAthleteId = {};
  
  if (connections) {
    console.log(`Total connections: ${connections.length}\n`);
    
    for (const conn of connections) {
      const email = conn.user_profiles?.email || 'Unknown';
      const athleteId = conn.strava_athlete_id;
      const expiresAt = typeof conn.expires_at === 'string' 
        ? new Date(conn.expires_at).getTime() / 1000 
        : conn.expires_at;
      const hoursLeft = (expiresAt - Date.now() / 1000) / 3600;
      
      console.log(`${email.padEnd(30)} | Athlete: ${athleteId || 'MISSING'.padEnd(10)} | Token: ${hoursLeft > 0 ? '✅' : '❌'} (${hoursLeft.toFixed(1)}h)`);
      
      if (athleteId) {
        connectionsByAthleteId[athleteId] = conn;
      }
    }
  }

  // 2. Check unprocessed webhook events by athlete
  console.log('\n\n📬 2. UNPROCESSED WEBHOOK EVENTS BY ATHLETE:\n');
  
  const { data: unprocessedEvents } = await supabase
    .from('strava_webhook_events')
    .select('owner_id')
    .eq('processed', false);

  if (unprocessedEvents) {
    const eventsByOwner = {};
    for (const event of unprocessedEvents) {
      eventsByOwner[event.owner_id] = (eventsByOwner[event.owner_id] || 0) + 1;
    }

    console.log('Athlete ID    | Events | Has Connection | User');
    console.log('-'.repeat(70));
    
    for (const [athleteId, count] of Object.entries(eventsByOwner)) {
      const conn = connectionsByAthleteId[athleteId];
      const hasConn = conn ? '✅' : '❌';
      const user = conn ? (conn.user_profiles?.email || conn.user_id.substring(0, 8)) : 'NO CONNECTION';
      console.log(`${athleteId.padEnd(12)} | ${count.toString().padStart(6)} | ${hasConn.padEnd(14)} | ${user}`);
    }
  }

  // 3. Identify the problems
  console.log('\n\n❗ 3. IDENTIFIED PROBLEMS:\n');
  
  console.log('A. TOKEN EXPIRATION:');
  const expiredTokens = connections?.filter(c => {
    const expiresAt = typeof c.expires_at === 'string' 
      ? new Date(c.expires_at).getTime() / 1000 
      : c.expires_at;
    return expiresAt <= Date.now() / 1000;
  }) || [];
  
  if (expiredTokens.length > 0) {
    console.log(`   ${expiredTokens.length} users have expired tokens:`);
    for (const conn of expiredTokens) {
      console.log(`   - ${conn.user_profiles?.email || conn.user_id}`);
    }
  } else {
    console.log('   All tokens are valid ✅');
  }

  console.log('\nB. MISSING ATHLETE IDS:');
  const missingAthleteIds = connections?.filter(c => !c.strava_athlete_id) || [];
  if (missingAthleteIds.length > 0) {
    console.log(`   ${missingAthleteIds.length} users missing athlete IDs:`);
    for (const conn of missingAthleteIds) {
      console.log(`   - ${conn.user_profiles?.email || conn.user_id}`);
    }
  } else {
    console.log('   All connections have athlete IDs ✅');
  }

  console.log('\nC. WEBHOOK EVENTS WITHOUT CONNECTIONS:');
  const orphanedAthletes = [];
  const { data: allEvents } = await supabase
    .from('strava_webhook_events')
    .select('owner_id')
    .eq('processed', false);
    
  if (allEvents) {
    const uniqueAthletes = [...new Set(allEvents.map(e => e.owner_id))];
    for (const athleteId of uniqueAthletes) {
      if (!connectionsByAthleteId[athleteId]) {
        orphanedAthletes.push(athleteId);
      }
    }
  }
  
  if (orphanedAthletes.length > 0) {
    console.log(`   ${orphanedAthletes.length} athlete IDs have webhook events but no connection:`);
    for (const id of orphanedAthletes) {
      const eventCount = allEvents.filter(e => e.owner_id === id).length;
      console.log(`   - Athlete ${id}: ${eventCount} events`);
    }
    console.log('\n   These are likely:');
    console.log('   • Old users who disconnected');
    console.log('   • Other users of the same Strava app (if app is public)');
    console.log('   • Test accounts');
  } else {
    console.log('   All webhook events have matching connections ✅');
  }

  // 4. Why this happened
  console.log('\n\n🔬 4. ROOT CAUSE ANALYSIS:\n');
  
  console.log('WHY ATHLETE_ID WAS "MISSING":');
  console.log('  • The database column is "strava_athlete_id" (not "athlete_id")');
  console.log('  • My check script was looking for a non-existent "athlete_id" field');
  console.log('  • The actual strava_athlete_id was populated correctly\n');
  
  console.log('WHY WEBHOOKS WEREN\'T PROCESSING:');
  console.log('  • Webhook endpoint at webhook/route.ts line 61 correctly checks strava_athlete_id');
  console.log('  • The issue was EXPIRED TOKENS preventing activity fetch');
  console.log('  • Token refresh only happens during webhook processing');
  console.log('  • If token expires and no webhook arrives, it stays expired\n');
  
  console.log('WHY WEBHOOK SUBSCRIPTION WASN\'T IN DB:');
  console.log('  • Subscription is created during initial setup but not saved');
  console.log('  • The subscription persists at Strava even without DB record');
  console.log('  • Missing DB record doesn\'t affect webhook delivery\n');

  // 5. Recommendations
  console.log('\n💡 5. RECOMMENDATIONS:\n');
  
  console.log('IMMEDIATE FIXES:');
  console.log('  ✅ Refresh all expired tokens');
  console.log('  ✅ Process all unprocessed webhook events');
  console.log('  ✅ Save webhook subscription to database\n');
  
  console.log('LONG-TERM IMPROVEMENTS:');
  console.log('  1. Add background job to refresh tokens before expiry');
  console.log('  2. Add webhook subscription check on app startup');
  console.log('  3. Add monitoring for unprocessed webhook events');
  console.log('  4. Consider adding retry logic for failed webhook processing\n');
  
  console.log('USER RECONNECTION:');
  if (missingAthleteIds.length > 0) {
    console.log('  ⚠️  Users with missing athlete IDs MUST reconnect');
  } else {
    console.log('  ✅ No users need to reconnect! All have athlete IDs');
  }
}

analyzeConnectionIssues().catch(console.error);