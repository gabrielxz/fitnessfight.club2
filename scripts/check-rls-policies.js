const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLSPolicies() {
  console.log('🔒 Checking RLS Status for All Tables\n');
  console.log('=' .repeat(70) + '\n');

  // List of tables to check
  const tables = [
    'strava_connections',
    'strava_activities', 
    'strava_webhook_events',
    'strava_webhook_subscriptions',
    'user_profiles',
    'user_points',
    'badges',
    'badge_progress',
    'user_badges',
    'habits',
    'habit_completions',
    'habit_summaries'
  ];

  console.log('Table Name                  | RLS Enabled | Test Query Result');
  console.log('-'.repeat(70));

  for (const table of tables) {
    // Test with service role (bypasses RLS)
    const { data: serviceData, error: serviceError } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    // Test with anon key (respects RLS)
    const anonSupabase = createClient(
      supabaseUrl, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { data: anonData, error: anonError } = await anonSupabase
      .from(table)
      .select('*')
      .limit(1);

    // Check if RLS is enabled by comparing results
    let rlsStatus = '❓ Unknown';
    let testResult = '';

    if (serviceError) {
      testResult = `Service error: ${serviceError.message.substring(0, 30)}`;
    } else if (anonError && anonError.message.includes('row-level security')) {
      rlsStatus = '✅ Enabled';
      testResult = '🚫 Blocked by RLS';
    } else if (anonError) {
      testResult = `Anon error: ${anonError.message.substring(0, 30)}`;
    } else if (anonData && serviceData) {
      rlsStatus = '❌ Disabled';
      testResult = '✅ Accessible';
    } else if (!anonData && serviceData) {
      rlsStatus = '✅ Enabled';
      testResult = '🚫 No rows returned (RLS filtering)';
    }

    console.log(`${table.padEnd(27)} | ${rlsStatus.padEnd(11)} | ${testResult}`);
  }

  console.log('\n\n🔍 Checking Specific RLS Issue for Webhook Processing:');
  console.log('-'.repeat(70));
  
  // Simulate what the webhook endpoint does
  console.log('\nSimulating webhook endpoint query:');
  console.log('Looking for connection with strava_athlete_id = 22415995...\n');

  // Using anon key (what the webhook endpoint uses)
  const anonSupabase = createClient(
    supabaseUrl, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: connTest, error: connError } = await anonSupabase
    .from('strava_connections')
    .select('*, user_profiles(timezone)')
    .eq('strava_athlete_id', '22415995')
    .single();

  if (connError) {
    console.log('❌ ANON KEY QUERY FAILED:');
    console.log(`   Error: ${connError.message}`);
    console.log('\n   This is why webhooks aren\'t processing!');
    console.log('   The webhook endpoint can\'t read strava_connections table.\n');
  } else if (connTest) {
    console.log('✅ Anon key query succeeded');
    console.log(`   Found connection for user: ${connTest.user_id}`);
  }

  // Try with service role
  const { data: serviceConn, error: serviceConnError } = await supabase
    .from('strava_connections')
    .select('*, user_profiles(timezone)')
    .eq('strava_athlete_id', '22415995')
    .single();

  if (serviceConn && !connTest) {
    console.log('\n✅ SERVICE ROLE QUERY WORKS:');
    console.log(`   Found connection for user: ${serviceConn.user_id}`);
    console.log('\n   🔴 CONFIRMED: RLS is blocking the webhook endpoint!');
  }

  console.log('\n\n💡 SOLUTION OPTIONS:');
  console.log('=' .repeat(70));
  console.log('\n1. DISABLE RLS on affected tables (recommended for your use case):');
  console.log('   - strava_connections');
  console.log('   - strava_activities');
  console.log('   - strava_webhook_events');
  console.log('   - user_profiles');
  console.log('   - user_points');
  console.log('   - badge_progress');
  console.log('   - user_badges\n');
  
  console.log('2. Or use SERVICE ROLE key in webhook endpoint (security risk)\n');
  
  console.log('3. Or create proper RLS policies (complex)\n');

  console.log('\n📝 SQL to disable RLS on all critical tables:');
  console.log('-'.repeat(70));
  console.log(`
-- Disable RLS on all tables that the webhook needs
ALTER TABLE strava_connections DISABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE strava_webhook_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE strava_webhook_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges DISABLE ROW LEVEL SECURITY;
ALTER TABLE badge_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges DISABLE ROW LEVEL SECURITY;

-- Optional: Keep RLS on sensitive tables only
-- ALTER TABLE habits DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE habit_completions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE habit_summaries DISABLE ROW LEVEL SECURITY;
  `);
}

checkRLSPolicies().catch(console.error);