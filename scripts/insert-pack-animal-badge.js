const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertPackAnimalBadge() {
  console.log('🐺 Inserting Pack Animal badge...\n');

  const badge = {
    code: 'pack_animal',
    name: 'Pack Animal',
    emoji: '🐺',
    category: 'social',
    description: 'Complete activities with multiple athletes (minimum 15 minutes elapsed time)',
    criteria: {
      type: 'single_activity',
      metric: 'athlete_count',
      min_elapsed_time: 900, // 15 minutes in seconds
      bronze: 2,
      silver: 3,
      gold: 6
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
    console.log(`  Bronze: ${badge.criteria.bronze} athletes`);
    console.log(`  Silver: ${badge.criteria.silver} athletes`);
    console.log(`  Gold: ${badge.criteria.gold} athletes`);
    console.log(`  Min time: ${badge.criteria.min_elapsed_time / 60} minutes`);

  } catch (error) {
    console.error('❌ Error inserting badge:', error);
    process.exit(1);
  }
}

insertPackAnimalBadge();