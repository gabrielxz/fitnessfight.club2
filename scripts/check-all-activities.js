const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllActivities() {
  console.log('🔍 Comprehensive Activity Check\n');
  console.log('=' .repeat(60) + '\n');

  // Get connection info
  const { data: connection } = await supabase
    .from('strava_connections')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!connection) {
    console.error('No Strava connection found');
    return;
  }

  const accessToken = connection.access_token;
  const expiresAt = typeof connection.expires_at === 'string' 
    ? new Date(connection.expires_at).getTime() / 1000 
    : connection.expires_at;
  const hoursUntilExpiry = (expiresAt - Date.now() / 1000) / 3600;

  console.log('🔗 Strava Connection:');
  console.log(`  User ID: ${connection.user_id}`);
  console.log(`  Athlete ID: ${connection.athlete_id}`);
  console.log(`  Token valid for: ${hoursUntilExpiry.toFixed(1)} hours`);
  console.log(`  Last updated: ${connection.updated_at}\n`);

  // Fetch activities from Strava for last 48 hours
  console.log('📥 Fetching from Strava API (last 48 hours)...');
  const after = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
  
  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch from Strava:', await response.text());
    return;
  }

  const stravaActivities = await response.json();
  console.log(`Found ${stravaActivities.length} activities in Strava:\n`);

  // Display all Strava activities
  console.log('Strava Activities:');
  console.log('-'.repeat(60));
  for (const act of stravaActivities) {
    const date = new Date(act.start_date_local);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    console.log(`ID: ${act.id} | ${act.name}`);
    console.log(`  Type: ${act.type} | Sport: ${act.sport_type} | Manual: ${act.manual}`);
    console.log(`  Date: ${dateStr}`);
    console.log(`  Duration: ${(act.moving_time / 60).toFixed(0)} min | Distance: ${(act.distance / 1000).toFixed(2)} km`);
    console.log(`  Relative Effort: ${act.suffer_score || 'N/A'}`);
    console.log();
  }

  // Check database activities
  console.log('\n📊 Database Activities (last 48 hours):');
  console.log('-'.repeat(60));
  
  const dbAfter = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: dbActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .gte('start_date_local', dbAfter)
    .order('start_date_local', { ascending: false });

  if (dbActivities && dbActivities.length > 0) {
    for (const act of dbActivities) {
      const date = new Date(act.start_date_local);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      console.log(`ID: ${act.strava_activity_id} | ${act.name}`);
      console.log(`  Type: ${act.type} | Sport: ${act.sport_type} | Manual: ${act.manual}`);
      console.log(`  Date: ${dateStr}`);
      console.log(`  Duration: ${(act.moving_time / 60).toFixed(0)} min | Distance: ${(act.distance / 1000).toFixed(2)} km`);
      console.log(`  Relative Effort: ${act.suffer_score || 'N/A'}`);
      console.log(`  Created in DB: ${act.created_at}`);
      console.log();
    }
  } else {
    console.log('No recent activities in database');
  }

  // Compare and find missing
  console.log('\n🔄 Sync Status:');
  console.log('-'.repeat(60));
  
  const dbIds = new Set(dbActivities?.map(a => a.strava_activity_id.toString()) || []);
  const stravaIds = new Set(stravaActivities.map(a => a.id.toString()));
  
  const missingInDb = stravaActivities.filter(a => !dbIds.has(a.id.toString()));
  const extraInDb = dbActivities?.filter(a => !stravaIds.has(a.strava_activity_id.toString())) || [];
  
  if (missingInDb.length > 0) {
    console.log(`❌ ${missingInDb.length} activities in Strava but NOT in database:`);
    for (const act of missingInDb) {
      console.log(`  - ${act.name} (${act.type}) - ID: ${act.id}`);
    }
  } else {
    console.log('✅ All Strava activities are in database');
  }
  
  if (extraInDb.length > 0) {
    console.log(`\n⚠️  ${extraInDb.length} activities in database but NOT in Strava:`);
    for (const act of extraInDb) {
      console.log(`  - ${act.name} (${act.type}) - ID: ${act.strava_activity_id}`);
    }
  }

  // Check for activities with "fake" in the name
  console.log('\n\n🎯 Looking for test activities (containing "fake"):');
  console.log('-'.repeat(60));
  
  const fakeInStrava = stravaActivities.filter(a => 
    a.name.toLowerCase().includes('fake')
  );
  
  const { data: fakeInDb } = await supabase
    .from('strava_activities')
    .select('*')
    .ilike('name', '%fake%');
  
  console.log(`Strava: Found ${fakeInStrava.length} "fake" activities`);
  for (const act of fakeInStrava) {
    console.log(`  - ${act.name} (${act.type})`);
  }
  
  console.log(`\nDatabase: Found ${fakeInDb?.length || 0} "fake" activities`);
  for (const act of fakeInDb || []) {
    console.log(`  - ${act.name} (${act.type})`);
  }

  // Offer to sync missing activities
  if (missingInDb.length > 0) {
    console.log('\n\n💡 To sync missing activities, run:');
    console.log('   node scripts/sync-missing-activities.js');
  }
}

checkAllActivities().catch(console.error);