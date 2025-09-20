const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertNoChillBadge() {
  console.log('🛑 Inserting No Chill badge...\n');

  const badge = {
    code: 'no_chill',
    name: 'No Chill',
    emoji: '🛑',
    category: 'intensity',
    description: 'Exercise for a high number of hours in a single week',
    criteria: {
      type: 'weekly_cumulative',
      metric: 'moving_time_hours',
      reset_period: 'weekly',
      bronze: 12,
      silver: 15,
      gold: 20
    },
    active: true
  };

  try {
    // Check if badge already exists
    const { data: existing } = await supabase
      .from('badges')
      .select('id')
      .eq('code', badge.code)
      .single();

    if (existing) {
      console.log('Badge already exists, updating...');
      const { data, error } = await supabase
        .from('badges')
        .update(badge)
        .eq('code', badge.code)
        .select();

      if (error) throw error;
      console.log('✅ Badge updated successfully!');
    } else {
      const { data, error } = await supabase
        .from('badges')
        .insert([badge])
        .select();

      if (error) throw error;
      console.log('✅ Badge inserted successfully!');
    }

    console.log('\nBadge details:');
    console.log(`  Name: ${badge.name} ${badge.emoji}`);
    console.log(`  Description: ${badge.description}`);
    console.log(`  Bronze: ${badge.criteria.bronze} hours`);
    console.log(`  Silver: ${badge.criteria.silver} hours`);
    console.log(`  Gold: ${badge.criteria.gold} hours`);
    console.log(`  Type: Weekly cumulative (resets each week)`);

  } catch (error) {
    console.error('❌ Error inserting badge:', error);
    process.exit(1);
  }
}

insertNoChillBadge();