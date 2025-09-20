const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertMileCollectorBadge() {
  console.log('🌍 Inserting Mile Collector badge...\n');

  const badge = {
    code: 'mile_collector',
    name: 'Mile Collector',
    emoji: '🌍',
    category: 'distance',
    description: 'Walk or Run total miles (cumulative over the whole contest)',
    criteria: {
      type: 'cumulative',
      metric: 'distance_miles',
      activity_types: ['Walk', 'Run', 'TrailRun', 'VirtualRun', 'Treadmill'],
      bronze: 50,
      silver: 100,
      gold: 200
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
    console.log(`  Bronze: ${badge.criteria.bronze} miles`);
    console.log(`  Silver: ${badge.criteria.silver} miles`);
    console.log(`  Gold: ${badge.criteria.gold} miles`);
    console.log(`  Activity Types: ${badge.criteria.activity_types.join(', ')}`);
    console.log(`  Type: Cumulative (never resets)`);

  } catch (error) {
    console.error('❌ Error inserting badge:', error);
    process.exit(1);
  }
}

insertMileCollectorBadge();