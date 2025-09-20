const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertRockSolidBadge() {
  console.log('🪨 Inserting Rock Solid badge...\n');

  const badge = {
    code: 'rock_solid',
    name: 'Rock Solid',
    emoji: '🪨',
    category: 'streak',
    description: 'Complete weeks with 100% habit completion (minimum 5 habits)',
    criteria: {
      type: 'habit_weeks',
      condition: 'habit_completion_100',
      min_habits: 5,
      bronze: 1,
      silver: 4,
      gold: 12
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
    console.log(`  Bronze: ${badge.criteria.bronze} week(s)`);
    console.log(`  Silver: ${badge.criteria.silver} weeks`);
    console.log(`  Gold: ${badge.criteria.gold} weeks`);
    console.log(`  Requirement: First 5 habits at 100% completion`);

  } catch (error) {
    console.error('❌ Error inserting badge:', error);
    process.exit(1);
  }
}

insertRockSolidBadge();