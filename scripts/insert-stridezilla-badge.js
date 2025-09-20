const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertStridezillaBadge() {
  console.log('🦖 Inserting Stridezilla badge...\n');

  const badge = {
    code: 'stridezilla',
    name: 'Stridezilla',
    emoji: '🦖',
    category: 'activity',
    description: 'Log hours on the elliptical in a single week',
    criteria: {
      type: 'weekly_cumulative',
      metric: 'moving_time_hours',
      activity_type: 'Elliptical',
      reset_period: 'weekly',
      bronze: 1,
      silver: 4,
      gold: 8
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
    console.log(`  Bronze: ${badge.criteria.bronze} hour(s)`);
    console.log(`  Silver: ${badge.criteria.silver} hours`);
    console.log(`  Gold: ${badge.criteria.gold} hours`);
    console.log(`  Activity Type: ${badge.criteria.activity_type}`);
    console.log(`  Type: Weekly cumulative (resets each week)`);

  } catch (error) {
    console.error('❌ Error inserting badge:', error);
    process.exit(1);
  }
}

insertStridezillaBadge();