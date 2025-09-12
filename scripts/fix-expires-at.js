const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixExpiresAt() {
  console.log('Fixing expires_at field in strava_connections...\n');

  // Get all connections
  const { data: connections, error } = await supabase
    .from('strava_connections')
    .select('*');

  if (error) {
    console.error('Error fetching connections:', error);
    return;
  }

  console.log(`Found ${connections?.length || 0} connections to fix\n`);

  for (const conn of connections || []) {
    console.log(`Processing user ${conn.user_id}...`);
    
    // Check if expires_at is a string (ISO date)
    if (typeof conn.expires_at === 'string' && conn.expires_at.includes('T')) {
      // Convert ISO string to Unix timestamp
      const unixTimestamp = Math.floor(new Date(conn.expires_at).getTime() / 1000);
      
      console.log(`  Current (string): ${conn.expires_at}`);
      console.log(`  Converting to Unix: ${unixTimestamp} (${new Date(unixTimestamp * 1000).toLocaleString()})`);
      
      // Update to Unix timestamp
      const { error: updateError } = await supabase
        .from('strava_connections')
        .update({ expires_at: unixTimestamp })
        .eq('user_id', conn.user_id);
      
      if (updateError) {
        console.error(`  ❌ Error updating: ${updateError.message}`);
      } else {
        console.log(`  ✅ Updated successfully`);
      }
    } else if (typeof conn.expires_at === 'number') {
      console.log(`  Already Unix timestamp: ${conn.expires_at}`);
      console.log(`  ✓ No update needed`);
    } else {
      console.log(`  ⚠️ Unexpected format: ${typeof conn.expires_at} - ${conn.expires_at}`);
    }
    
    console.log('');
  }

  console.log('✨ All connections processed!');
  
  // Verify the changes
  console.log('\nVerifying changes...\n');
  const { data: updated, error: verifyError } = await supabase
    .from('strava_connections')
    .select('user_id, expires_at');
  
  if (!verifyError && updated) {
    for (const conn of updated) {
      const isValid = typeof conn.expires_at === 'number' || 
                     (typeof conn.expires_at === 'string' && !conn.expires_at.includes('T'));
      console.log(`User ${conn.user_id}: ${isValid ? '✅' : '❌'} ${conn.expires_at}`);
    }
  }
}

fixExpiresAt();