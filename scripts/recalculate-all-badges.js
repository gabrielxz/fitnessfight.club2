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

async function recalculateAllBadges() {
  console.log('🔄 RECALCULATING ALL BADGES\n');
  console.log('=' .repeat(70) + '\n');

  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'; // Gabriel
  const { weekStart, weekEnd } = getWeekBoundaries(new Date());

  // Get all badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true);

  // Get all activities
  const { data: allActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);

  for (const badge of badges || []) {
    console.log(`\n📛 ${badge.name} (${badge.emoji})`);
    console.log(`Type: ${badge.criteria.type}`);
    console.log('-'.repeat(50));

    let progressData = {
      user_id: userId,
      badge_id: badge.id,
      current_value: 0,
      bronze_achieved: false,
      silver_achieved: false,
      gold_achieved: false,
      last_updated: new Date().toISOString()
    };

    switch (badge.criteria.type) {
      case 'cumulative': {
        // Recalculate from all activities
        const relevantActivities = allActivities?.filter(a => {
          if (badge.criteria.activity_type) {
            return a.type === badge.criteria.activity_type || a.sport_type === badge.criteria.activity_type;
          }
          return true;
        }) || [];

        for (const act of relevantActivities) {
          switch (badge.criteria.metric) {
            case 'elevation_gain':
              progressData.current_value += act.total_elevation_gain || 0;
              break;
            case 'distance_km':
              progressData.current_value += (act.distance || 0) / 1000;
              break;
          }
        }

        console.log(`  Activities counted: ${relevantActivities.length}`);
        console.log(`  Total value: ${progressData.current_value.toFixed(2)}`);
        
        // No period for cumulative badges
        progressData.period_start = null;
        progressData.period_end = null;
        break;
      }

      case 'weekly_cumulative': {
        // Calculate for current week only
        const relevantActivities = allActivities?.filter(a => {
          const actDate = a.start_date_local.split('T')[0];
          if (actDate < weekStart || actDate > weekEnd) return false;
          
          if (badge.criteria.activity_type) {
            return a.type === badge.criteria.activity_type || a.sport_type === badge.criteria.activity_type;
          }
          return true;
        }) || [];

        for (const act of relevantActivities) {
          switch (badge.criteria.metric) {
            case 'moving_time_hours':
              progressData.current_value += (act.moving_time || 0) / 3600;
              break;
            case 'moving_time_minutes':
              progressData.current_value += (act.moving_time || 0) / 60;
              break;
            case 'distance_miles':
              progressData.current_value += (act.distance || 0) / 1609.34;
              break;
            case 'suffer_score':
              progressData.current_value += act.suffer_score || 0;
              break;
          }
        }

        console.log(`  Week: ${weekStart} to ${weekEnd}`);
        console.log(`  Activities counted: ${relevantActivities.length}`);
        console.log(`  Total value: ${progressData.current_value.toFixed(2)}`);
        
        progressData.period_start = weekStart;
        progressData.period_end = weekEnd;
        break;
      }

      case 'single_activity': {
        // Find best single activity
        const relevantActivities = allActivities?.filter(a => {
          if (badge.criteria.activity_type) {
            return a.type === badge.criteria.activity_type || a.sport_type === badge.criteria.activity_type;
          }
          return true;
        }) || [];

        for (const act of relevantActivities) {
          let value = 0;
          switch (badge.criteria.metric) {
            case 'moving_time_minutes':
              value = (act.moving_time || 0) / 60;
              break;
            case 'average_speed_kmh':
              value = (act.average_speed || 0) * 3.6;
              break;
            case 'calories_per_hour':
              const hours = act.moving_time / 3600;
              value = hours > 0 ? (act.calories || 0) / hours : 0;
              break;
          }
          progressData.current_value = Math.max(progressData.current_value, value);
        }

        console.log(`  Best value: ${progressData.current_value.toFixed(2)}`);
        progressData.period_start = null;
        progressData.period_end = null;
        break;
      }

      case 'unique_sports': {
        // Count unique sports
        if (badge.criteria.sports_list && badge.criteria.sports_list.length > 0) {
          const sportActivities = allActivities?.filter(a => 
            badge.criteria.sports_list.includes(a.sport_type)
          ) || [];
          
          const uniqueSports = new Set(sportActivities.map(a => a.sport_type));
          progressData.current_value = uniqueSports.size;
          progressData.metadata = { sports: Array.from(uniqueSports) };
          
          console.log(`  Sports found: ${Array.from(uniqueSports).join(', ') || 'None'}`);
          console.log(`  Unique count: ${uniqueSports.size}`);
        }
        progressData.period_start = null;
        progressData.period_end = null;
        break;
      }

      case 'weekly_count': {
        // Count weeks meeting criteria (Belfie)
        if (badge.criteria.condition === 'photo_count > 0') {
          const weeksWithPhotos = new Set();
          
          for (const act of allActivities || []) {
            if ((act.photo_count || 0) > 0) {
              const { weekStart: actWeek } = getWeekBoundaries(new Date(act.start_date_local));
              weeksWithPhotos.add(actWeek);
            }
          }
          
          progressData.current_value = weeksWithPhotos.size;
          progressData.metadata = { counted_weeks: Array.from(weeksWithPhotos) };
          
          console.log(`  Weeks with photos: ${weeksWithPhotos.size}`);
        }
        progressData.period_start = null;
        progressData.period_end = null;
        break;
      }

      default:
        console.log(`  Skipping badge type: ${badge.criteria.type}`);
        continue;
    }

    // Determine tier achievements
    if (progressData.current_value >= badge.criteria.gold) {
      progressData.gold_achieved = true;
      progressData.silver_achieved = true;
      progressData.bronze_achieved = true;
    } else if (progressData.current_value >= badge.criteria.silver) {
      progressData.silver_achieved = true;
      progressData.bronze_achieved = true;
    } else if (progressData.current_value >= badge.criteria.bronze) {
      progressData.bronze_achieved = true;
    }

    console.log(`  Bronze (${badge.criteria.bronze}): ${progressData.bronze_achieved ? '✅' : '❌'}`);
    console.log(`  Silver (${badge.criteria.silver}): ${progressData.silver_achieved ? '✅' : '❌'}`);
    console.log(`  Gold (${badge.criteria.gold}): ${progressData.gold_achieved ? '✅' : '❌'}`);

    // Delete existing progress
    if (progressData.period_start) {
      await supabase
        .from('badge_progress')
        .delete()
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .eq('period_start', progressData.period_start);
    } else {
      await supabase
        .from('badge_progress')
        .delete()
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .is('period_start', null);
    }

    // Insert fresh progress
    const { error } = await supabase
      .from('badge_progress')
      .insert(progressData);

    if (error) {
      console.error(`  ❌ Error updating progress:`, error.message);
    } else {
      console.log(`  ✅ Progress updated`);
    }

    // Update user_badges if tier achieved
    const tierAchieved = progressData.gold_achieved ? 'gold' : 
                        progressData.silver_achieved ? 'silver' : 
                        progressData.bronze_achieved ? 'bronze' : null;

    if (tierAchieved) {
      const tierPoints = { bronze: 3, silver: 6, gold: 15 };
      
      const { data: existing } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .single();

      if (existing) {
        const tierOrder = { bronze: 1, silver: 2, gold: 3 };
        if (tierOrder[tierAchieved] > tierOrder[existing.tier]) {
          await supabase
            .from('user_badges')
            .update({ 
              tier: tierAchieved, 
              progress_value: progressData.current_value,
              points_awarded: tierPoints[tierAchieved]
            })
            .eq('id', existing.id);
          
          console.log(`  🏆 Badge upgraded to ${tierAchieved}`);
        }
      } else {
        await supabase
          .from('user_badges')
          .insert({ 
            user_id: userId, 
            badge_id: badge.id, 
            tier: tierAchieved, 
            progress_value: progressData.current_value,
            points_awarded: tierPoints[tierAchieved]
          });
        
        console.log(`  🏆 New ${tierAchieved} badge awarded`);
      }
    }
  }

  console.log('\n\n✨ Recalculation complete!');
}

recalculateAllBadges().catch(console.error);