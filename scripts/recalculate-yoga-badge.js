const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getWeekBoundaries(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const adjustedDay = day === 0 ? 7 : day;
  const diff = d.getUTCDate() - (adjustedDay - 1);
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { 
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0]
  };
}

async function recalculateYogaBadge() {
  console.log('🧘 Recalculating Zen Master badge from scratch...\n');
  console.log('=' .repeat(70) + '\n');

  const { weekStart, weekEnd } = getWeekBoundaries(new Date());
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'; // Gabriel

  // Get zen master badge
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  if (!badge) {
    console.error('Zen Master badge not found!');
    return;
  }

  // Get all yoga activities for this week
  console.log(`📋 Calculating yoga hours for week ${weekStart} to ${weekEnd}:\n`);
  
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_date_local', weekStart)
    .lte('start_date_local', weekEnd + 'T23:59:59')
    .is('deleted_at', null)
    .order('start_date_local', { ascending: true });

  let totalYogaHours = 0;
  let yogaCount = 0;
  
  for (const act of activities || []) {
    // Check if this is a yoga activity
    const isYoga = act.type === 'Yoga' || act.sport_type === 'Yoga';
    
    if (isYoga) {
      const hours = act.moving_time / 3600;
      totalYogaHours += hours;
      yogaCount++;
      console.log(`✅ ${act.name}: ${hours.toFixed(2)} hours`);
    }
  }
  
  console.log(`\n📊 TOTAL: ${yogaCount} yoga activities, ${totalYogaHours.toFixed(2)} hours\n`);

  // Determine tier achieved
  let bronzeAchieved = false;
  let silverAchieved = false;
  let goldAchieved = false;
  let tierAchieved = null;

  if (totalYogaHours >= badge.criteria.gold) {
    goldAchieved = true;
    silverAchieved = true;
    bronzeAchieved = true;
    tierAchieved = 'gold';
  } else if (totalYogaHours >= badge.criteria.silver) {
    silverAchieved = true;
    bronzeAchieved = true;
    tierAchieved = 'silver';
  } else if (totalYogaHours >= badge.criteria.bronze) {
    bronzeAchieved = true;
    tierAchieved = 'bronze';
  }

  console.log('🏅 Badge tier progress:');
  console.log(`  Bronze (${badge.criteria.bronze}h): ${bronzeAchieved ? '✅' : '❌'}`);
  console.log(`  Silver (${badge.criteria.silver}h): ${silverAchieved ? '✅' : '❌'}`);
  console.log(`  Gold (${badge.criteria.gold}h): ${goldAchieved ? '✅' : '❌'}\n`);

  // Update badge_progress with correct cumulative value
  const { error: progressError } = await supabase
    .from('badge_progress')
    .upsert({
      user_id: userId,
      badge_id: badge.id,
      current_value: totalYogaHours,
      bronze_achieved: bronzeAchieved,
      silver_achieved: silverAchieved,
      gold_achieved: goldAchieved,
      period_start: weekStart,
      period_end: weekEnd,
      last_updated: new Date().toISOString()
    }, {
      onConflict: 'user_id,badge_id,period_start'
    });

  if (progressError) {
    console.error('Error updating badge progress:', progressError);
    return;
  }

  console.log('✅ Badge progress updated successfully!\n');

  // Award badge if tier achieved
  if (tierAchieved) {
    const tierPoints = { bronze: 3, silver: 6, gold: 15 };
    
    // Check existing badge
    const { data: existing } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single();

    if (existing) {
      const tierOrder = { bronze: 1, silver: 2, gold: 3 };
      if (tierOrder[tierAchieved] > tierOrder[existing.tier]) {
        // Upgrade tier
        await supabase
          .from('user_badges')
          .update({ 
            tier: tierAchieved, 
            progress_value: totalYogaHours,
            points_awarded: tierPoints[tierAchieved]
          })
          .eq('id', existing.id);
        
        console.log(`🏆 Badge upgraded from ${existing.tier} to ${tierAchieved}!`);
        
        // Award additional points
        const pointsToAward = tierPoints[tierAchieved] - (existing.points_awarded || 0);
        if (pointsToAward > 0) {
          await supabase.rpc('increment_badge_points', {
            p_user_id: userId,
            p_week_start: weekStart,
            p_points_to_add: pointsToAward
          });
          console.log(`➕ Awarded ${pointsToAward} additional badge points`);
        }
      } else {
        console.log(`Badge already at ${existing.tier} tier (no change needed)`);
      }
    } else {
      // Award new badge
      await supabase
        .from('user_badges')
        .insert({ 
          user_id: userId, 
          badge_id: badge.id, 
          tier: tierAchieved, 
          progress_value: totalYogaHours,
          points_awarded: tierPoints[tierAchieved]
        });
      
      console.log(`🏆 New ${tierAchieved} badge awarded!`);
      
      // Award points
      await supabase.rpc('increment_badge_points', {
        p_user_id: userId,
        p_week_start: weekStart,
        p_points_to_add: tierPoints[tierAchieved]
      });
      console.log(`➕ Awarded ${tierPoints[tierAchieved]} badge points`);
    }
  }
  
  console.log('\n✨ Recalculation complete!');
}

recalculateYogaBadge().catch(console.error);