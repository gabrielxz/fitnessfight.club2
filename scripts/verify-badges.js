const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyBadges() {
  console.log('Fetching all badges from database...\n');

  const { data: badges, error } = await supabase
    .from('badges')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching badges:', error);
    return;
  }

  console.log(`Total badges in database: ${badges.length}\n`);
  
  badges.forEach(badge => {
    console.log(`${badge.emoji} ${badge.name} (${badge.code})`);
    console.log(`  Category: ${badge.category}`);
    console.log(`  Description: ${badge.description || 'No description'}`);
    console.log(`  Type: ${badge.criteria.type}`);
    console.log(`  Bronze: ${badge.criteria.bronze}, Silver: ${badge.criteria.silver}, Gold: ${badge.criteria.gold}`);
    if (badge.start_date || badge.end_date) {
      console.log(`  Date Range: ${badge.start_date || 'Any'} to ${badge.end_date || 'Any'}`);
    }
    console.log('');
  });
}

verifyBadges();