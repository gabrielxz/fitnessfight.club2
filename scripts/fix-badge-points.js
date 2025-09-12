const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixBadgePoints() {
  console.log('Fixing badge points_awarded field...\n');
  
  // Get all user badges with 0 points_awarded
  const { data: badgesWithZeroPoints } = await supabase
    .from('user_badges')
    .select('*, badges(*)')
    .eq('points_awarded', 0);
  
  if (!badgesWithZeroPoints || badgesWithZeroPoints.length === 0) {
    console.log('No badges with 0 points_awarded found');
    return;
  }
  
  console.log(`Found ${badgesWithZeroPoints.length} badges with 0 points_awarded:\n`);
  
  const tierPoints = { bronze: 3, silver: 6, gold: 15 };
  
  for (const userBadge of badgesWithZeroPoints) {
    const correctPoints = tierPoints[userBadge.tier];
    console.log(`Fixing ${userBadge.badges.name} (${userBadge.tier}): 0 -> ${correctPoints} points`);
    
    await supabase
      .from('user_badges')
      .update({ points_awarded: correctPoints })
      .eq('id', userBadge.id);
  }
  
  console.log('\n✅ Fixed all badge points');
}

fixBadgePoints().catch(console.error);