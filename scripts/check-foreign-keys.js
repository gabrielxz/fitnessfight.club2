const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkForeignKeys() {
  console.log('🔍 Checking Foreign Key Relationships\n');
  console.log('=' .repeat(60) + '\n');

  // Check if we can query the relationship with service role
  console.log('1. Testing with SERVICE ROLE key:');
  const { data: serviceTest, error: serviceError } = await supabase
    .from('strava_connections')
    .select('*, user_profiles!inner(timezone, email)')
    .limit(1);

  if (serviceError) {
    console.log('   ❌ Failed:', serviceError.message);
  } else if (serviceTest && serviceTest.length > 0) {
    console.log('   ✅ Success! Can join user_profiles');
    console.log('   Sample:', serviceTest[0].user_profiles?.email);
  } else {
    console.log('   ⚠️  No data to test with');
  }

  // Check with anon key
  console.log('\n2. Testing with ANON key:');
  const anonSupabase = createClient(
    supabaseUrl, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: anonTest, error: anonError } = await anonSupabase
    .from('strava_connections')
    .select('*, user_profiles!inner(timezone)')
    .limit(1);

  if (anonError) {
    console.log('   ❌ Failed:', anonError.message);
    if (anonError.message.includes('relationship')) {
      console.log('   → Foreign key exists but not accessible via API');
    }
  } else if (anonTest && anonTest.length > 0) {
    console.log('   ✅ Success! Can join user_profiles');
  } else {
    console.log('   ⚠️  No data returned');
  }

  // Try the exact query from webhook endpoint
  console.log('\n3. Testing exact webhook query:');
  const { data: webhookTest, error: webhookError } = await anonSupabase
    .from('strava_connections')
    .select('*, user_profiles(timezone)')
    .eq('strava_athlete_id', '22415995')
    .single();

  if (webhookError) {
    console.log('   ❌ Failed:', webhookError.message);
  } else if (webhookTest) {
    console.log('   ✅ Success! Found connection');
    console.log('   Timezone:', webhookTest.user_profiles?.timezone || 'not found');
  }

  // Check what relationships Supabase knows about
  console.log('\n4. Checking table relationships:');
  
  // Try different join syntaxes
  const joinTests = [
    { syntax: 'user_profiles(timezone)', desc: 'Nested select' },
    { syntax: 'user_profiles!inner(timezone)', desc: 'Inner join' },
    { syntax: 'user_profiles!left(timezone)', desc: 'Left join' }
  ];

  for (const test of joinTests) {
    const { data, error } = await anonSupabase
      .from('strava_connections')
      .select(`id, ${test.syntax}`)
      .limit(1);
    
    console.log(`   ${test.desc}: ${error ? '❌' : '✅'}`);
    if (error && !error.message.includes('relationship')) {
      console.log(`     Different error: ${error.message.substring(0, 50)}`);
    }
  }

  console.log('\n\n📝 DIAGNOSIS:');
  console.log('=' .repeat(60));
  
  if (webhookError && webhookError.message.includes('relationship')) {
    console.log('❌ Foreign key relationship is NOT accessible via Supabase API');
    console.log('\nSOLUTION:');
    console.log('1. Go to Supabase Dashboard > Database > Tables');
    console.log('2. Click on strava_connections table');
    console.log('3. Check if user_id has a foreign key to user_profiles');
    console.log('4. If not, run the migration SQL');
    console.log('5. If yes, try "Reload Schema" in Supabase dashboard');
  } else if (webhookTest) {
    console.log('✅ Foreign key relationship works!');
    console.log('The webhook should be processing correctly.');
  }
}

checkForeignKeys().catch(console.error);