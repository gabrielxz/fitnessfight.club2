const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConnection() {
  console.log('Checking Strava connections...\n');

  // Get all Strava connections
  const { data: connections, error } = await supabase
    .from('strava_connections')
    .select('*');

  if (error) {
    console.error('Error fetching connections:', error);
    return;
  }

  console.log(`Found ${connections?.length || 0} connections:\n`);

  for (const conn of connections || []) {
    console.log(`User ID: ${conn.user_id}`);
    console.log(`Athlete ID: ${conn.strava_athlete_id}`);
    console.log(`Expires at: ${conn.expires_at} (${new Date(conn.expires_at * 1000).toLocaleString()})`);
    
    const now = Math.floor(Date.now() / 1000);
    if (conn.expires_at <= now) {
      console.log(`Status: ❌ EXPIRED (needs refresh)`);
    } else {
      console.log(`Status: ✅ Valid`);
    }
    
    console.log(`Created: ${conn.created_at}`);
    console.log(`Updated: ${conn.updated_at}`);
    console.log('---');
  }
}

checkConnection();