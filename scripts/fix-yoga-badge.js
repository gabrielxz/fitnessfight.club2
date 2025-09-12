const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  const weekStart = '2025-09-08';
  const weekEnd = '2025-09-14';
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce';
  
  // Get badge
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  // First, delete any existing progress for this week
  await supabase
    .from('badge_progress')
    .delete()
    .eq('user_id', userId)
    .eq('badge_id', badge.id)
    .eq('period_start', weekStart);

  // Now insert fresh progress
  const { error } = await supabase
    .from('badge_progress')
    .insert({
      user_id: userId,
      badge_id: badge.id,
      current_value: 5.13,
      bronze_achieved: true,
      silver_achieved: true,
      gold_achieved: false,
      period_start: weekStart,
      period_end: weekEnd,
      last_updated: new Date().toISOString()
    });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Badge progress updated to 5.13 hours');
    
    // Now update the user_badges to silver
    const tierPoints = { bronze: 3, silver: 6, gold: 15 };
    
    const { data: existing } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (existing && existing.tier !== 'silver') {
      const pointsToAward = tierPoints.silver - (existing.points_awarded || 0);
      
      await supabase
        .from('user_badges')
        .update({ 
          tier: 'silver', 
          progress_value: 5.13,
          points_awarded: tierPoints.silver
        })
        .eq('id', existing.id);
      
      console.log('✅ Badge upgraded to silver!');
      
      if (pointsToAward > 0) {
        await supabase.rpc('increment_badge_points', {
          p_user_id: userId,
          p_week_start: weekStart,
          p_points_to_add: pointsToAward
        });
        console.log(`✅ Awarded ${pointsToAward} additional badge points`);
      }
    } else if (!existing) {
      console.log('No existing badge found, creating new one...');
      await supabase
        .from('user_badges')
        .insert({ 
          user_id: userId, 
          badge_id: badge.id, 
          tier: 'silver', 
          progress_value: 5.13,
          points_awarded: tierPoints.silver
        });
      console.log('✅ Silver badge awarded!');
      
      await supabase.rpc('increment_badge_points', {
        p_user_id: userId,
        p_week_start: weekStart,
        p_points_to_add: tierPoints.silver
      });
      console.log(`✅ Awarded ${tierPoints.silver} badge points`);
    } else {
      console.log('Badge already at silver tier');
    }
  }
}

fix().catch(console.error);