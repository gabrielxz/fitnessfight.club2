const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBadges() {
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true)
    .order('name');

  console.log('ACTIVE BADGES AND THEIR CALCULATION TYPES:');
  console.log('=' .repeat(70));
  
  const badgeTypes = {};
  
  for (const badge of badges || []) {
    const type = badge.criteria.type;
    if (!badgeTypes[type]) badgeTypes[type] = [];
    badgeTypes[type].push(badge);
    
    console.log(`\nBadge: ${badge.name} (${badge.code})`);
    console.log(`  Emoji: ${badge.emoji}`);
    console.log(`  Type: ${badge.criteria.type}`);
    console.log(`  Metric: ${badge.criteria.metric || 'N/A'}`);
    console.log(`  Activity Type: ${badge.criteria.activity_type || 'Any'}`);
    console.log(`  Reset Period: ${badge.criteria.reset_period || 'None'}`);
    console.log(`  Condition: ${badge.criteria.condition || 'None'}`);
    console.log(`  Thresholds: Bronze=${badge.criteria.bronze}, Silver=${badge.criteria.silver}, Gold=${badge.criteria.gold}`);
    
    if (badge.criteria.sports_list) {
      console.log(`  Sports List: ${badge.criteria.sports_list.join(', ')}`);
    }
  }
  
  console.log('\n' + '=' .repeat(70));
  console.log('SUMMARY BY TYPE:');
  console.log('=' .repeat(70));
  
  for (const [type, badgeList] of Object.entries(badgeTypes)) {
    console.log(`\n${type}: ${badgeList.length} badges`);
    badgeList.forEach(b => console.log(`  - ${b.name}`));
  }
}

checkBadges().catch(console.error);