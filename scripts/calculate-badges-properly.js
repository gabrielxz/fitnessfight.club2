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

async function calculateAllBadges() {
  console.log('🏅 Calculating badges for all activities this week...\n');

  // Get Gabriel's user ID
  const { data: user } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', 'gabrielbeal@gmail.com')
    .single();

  if (!user) {
    console.error('User not found');
    return;
  }

  const userId = user.id;
  const { weekStart, weekEnd } = getWeekBoundaries(new Date());
  
  console.log(`User: Gabriel Beal (${userId})`);
  console.log(`Week: ${weekStart} to ${weekEnd}\n`);

  // Get all activities for this week
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_date', weekStart)
    .lte('start_date', weekEnd + 'T23:59:59')
    .is('deleted_at', null);

  console.log(`Found ${activities?.length || 0} activities this week:\n`);

  // Calculate cumulative metrics for the week
  let totalBikeMiles = 0;
  let totalYogaHours = 0;
  let totalElevation = 0;
  let totalRelativeEffort = 0;
  let hasPhotos = false;

  for (const activity of activities || []) {
    console.log(`- ${activity.name} (${activity.type})`);
    
    if (activity.type === 'Ride') {
      const miles = (activity.distance || 0) / 1609.34;
      totalBikeMiles += miles;
      console.log(`  🚴 ${miles.toFixed(1)} miles`);
    }
    
    if (activity.type === 'Yoga' || activity.sport_type === 'Yoga') {
      const hours = (activity.moving_time || 0) / 3600;
      totalYogaHours += hours;
      console.log(`  🧘 ${hours.toFixed(1)} hours`);
    }
    
    if (activity.total_elevation_gain) {
      totalElevation += activity.total_elevation_gain;
      console.log(`  ⛰️ ${activity.total_elevation_gain}m elevation`);
    }
    
    if (activity.suffer_score) {
      totalRelativeEffort += activity.suffer_score;
      console.log(`  💪 ${activity.suffer_score} RE`);
    }
    
    if (activity.photo_count > 0) {
      hasPhotos = true;
      console.log(`  📸 ${activity.photo_count} photos`);
    }
  }

  console.log('\n📊 Weekly totals:');
  console.log(`  🚴 Iron Calves: ${totalBikeMiles.toFixed(1)} miles`);
  console.log(`  🧘 Zen Master: ${totalYogaHours.toFixed(1)} hours`);
  console.log(`  🏔️ Everester: ${totalElevation}m elevation (cumulative)`);
  console.log(`  🥵 Tryhard: ${totalRelativeEffort} RE`);
  console.log(`  📸 Belfie: ${hasPhotos ? 'Yes' : 'No'} photos this week`);

  // Update badge progress
  console.log('\n💾 Updating badge progress...\n');

  // Get all badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true);

  for (const badge of badges || []) {
    let currentValue = 0;
    let shouldUpdate = false;

    switch (badge.code) {
      case 'iron_calves':
        currentValue = totalBikeMiles;
        shouldUpdate = totalBikeMiles > 0;
        break;
      case 'zen_master':
        currentValue = totalYogaHours;
        shouldUpdate = totalYogaHours > 0;
        break;
      case 'tryhard':
        currentValue = totalRelativeEffort;
        shouldUpdate = totalRelativeEffort > 0;
        break;
      case 'everester':
        // For cumulative badges, we need to add to existing total
        const { data: existing } = await supabase
          .from('badge_progress')
          .select('current_value')
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
          .is('period_start', null)
          .single();
        currentValue = (existing?.current_value || 0) + totalElevation;
        shouldUpdate = totalElevation > 0;
        break;
      case 'belfie':
        // Count weeks with photos
        if (hasPhotos) {
          const { data: existingWeeks } = await supabase
            .from('badge_progress')
            .select('metadata')
            .eq('user_id', userId)
            .eq('badge_id', badge.id)
            .single();
          
          const metadata = existingWeeks?.metadata || { counted_weeks: [] };
          if (!metadata.counted_weeks.includes(weekStart)) {
            metadata.counted_weeks.push(weekStart);
            currentValue = metadata.counted_weeks.length;
            shouldUpdate = true;
          }
        }
        break;
    }

    if (shouldUpdate) {
      const progress = {
        user_id: userId,
        badge_id: badge.id,
        current_value: currentValue,
        bronze_achieved: currentValue >= badge.criteria.bronze,
        silver_achieved: currentValue >= badge.criteria.silver,
        gold_achieved: currentValue >= badge.criteria.gold,
        last_updated: new Date().toISOString()
      };

      // Add period fields for weekly badges
      if (badge.criteria.reset_period === 'weekly') {
        progress.period_start = weekStart;
        progress.period_end = weekEnd;
      }

      // Check if record exists first
      let existing;
      if (badge.criteria.reset_period === 'weekly') {
        const { data } = await supabase
          .from('badge_progress')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
          .eq('period_start', weekStart)
          .single();
        existing = data;
      } else {
        // For non-weekly badges, check without period_start
        const { data } = await supabase
          .from('badge_progress')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_id', badge.id)
          .is('period_start', null)
          .single();
        existing = data;
      }

      let error;
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('badge_progress')
          .update(progress)
          .eq('id', existing.id);
        error = updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('badge_progress')
          .insert(progress);
        error = insertError;
      }

      if (error) {
        console.error(`❌ Error updating ${badge.name}:`, error.message);
      } else {
        console.log(`✅ ${badge.emoji} ${badge.name}: ${currentValue.toFixed(1)} / ${badge.criteria.bronze} (Bronze)`);
        
        // Check if we earned a tier
        if (progress.gold_achieved) {
          console.log(`   🏆 Gold tier achieved!`);
          await awardBadge(userId, badge.id, 'gold');
        } else if (progress.silver_achieved) {
          console.log(`   🥈 Silver tier achieved!`);
          await awardBadge(userId, badge.id, 'silver');
        } else if (progress.bronze_achieved) {
          console.log(`   🥉 Bronze tier achieved!`);
          await awardBadge(userId, badge.id, 'bronze');
        }
      }
    }
  }

  console.log('\n✨ Badge calculation complete!');
}

async function awardBadge(userId, badgeId, tier) {
  const { data: existing } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .single();

  if (!existing) {
    await supabase
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badgeId,
        tier: tier,
        earned_at: new Date().toISOString()
      });
    console.log(`      🎉 NEW BADGE EARNED!`);
    
    // Update badge points
    const points = tier === 'gold' ? 15 : tier === 'silver' ? 6 : 3;
    await supabase.rpc('increment_badge_points', {
      p_user_id: userId,
      p_week_start: getWeekBoundaries(new Date()).weekStart,
      p_points_to_add: points
    });
  } else if ((tier === 'gold' && existing.tier !== 'gold') || 
             (tier === 'silver' && existing.tier === 'bronze')) {
    await supabase
      .from('user_badges')
      .update({ tier })
      .eq('id', existing.id);
    console.log(`      ⬆️ BADGE UPGRADED!`);
  }
}

calculateAllBadges();