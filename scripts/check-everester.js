const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEverester() {
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce';
  
  // Get all activities
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('name, total_elevation_gain, start_date_local, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  
  let cumulative = 0;
  console.log('Elevation gain per activity:');
  for (const act of activities || []) {
    const gain = act.total_elevation_gain || 0;
    cumulative += gain;
    console.log(`  ${act.name}: ${gain}m (cumulative: ${cumulative.toFixed(1)}m)`);
  }
  
  console.log(`\nTotal elevation gain: ${cumulative.toFixed(1)}m`);
  
  // Check badge progress
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'everester')
    .single();
    
  const { data: progress } = await supabase
    .from('badge_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .is('period_start', null)
    .single();
    
  console.log(`Badge progress shows: ${progress?.current_value || 0}m`);
  
  if (Math.abs((progress?.current_value || 0) - cumulative) > 0.1) {
    console.log('\n⚠️  CUMULATIVE BADGE IS DOUBLE-COUNTING!');
    console.log('The handleCumulativeBadge function is incrementing on top of existing progress.');
    console.log('This causes the value to grow exponentially as activities are reprocessed.');
    console.log('\nEach time an activity is processed, it adds its elevation gain to the total,');
    console.log('even if that activity was already counted in previous calculations.');
  }
}

checkEverester().catch(console.error);