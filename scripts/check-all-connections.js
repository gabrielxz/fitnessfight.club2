const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllConnections() {
  console.log('Checking all Strava connections...\n');

  // Get all connections
  const { data: connections, error } = await supabase
    .from('strava_connections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching connections:', error);
    return;
  }

  console.log(`Found ${connections?.length || 0} connections:\n`);

  if (connections && connections.length > 0) {
    for (const conn of connections) {
      console.log('Connection ID:', conn.id);
      console.log('  User ID:', conn.user_id);
      console.log('  Strava Athlete ID:', conn.strava_athlete_id);
      console.log('  Athlete ID field:', conn.athlete_id);
      console.log('  Created:', conn.created_at);
      console.log('  Updated:', conn.updated_at);
      
      const expiresAt = typeof conn.expires_at === 'string' 
        ? new Date(conn.expires_at).getTime() / 1000 
        : conn.expires_at;
      const hoursLeft = (expiresAt - Date.now() / 1000) / 3600;
      console.log('  Token expires in:', hoursLeft.toFixed(1), 'hours');
      console.log('');
    }
  } else {
    console.log('No connections found!');
  }

  // Check if athlete_id column exists
  console.log('\nChecking if athlete_id column exists...');
  const { data: testQuery, error: testError } = await supabase
    .from('strava_connections')
    .select('athlete_id')
    .limit(1);

  if (testError && testError.message.includes('column')) {
    console.log('❌ athlete_id column does NOT exist in the table');
    console.log('   Only strava_athlete_id column exists');
  } else {
    console.log('✅ athlete_id column exists');
  }
}

checkAllConnections().catch(console.error);