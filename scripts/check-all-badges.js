const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

async function checkAllBadges() {
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'; // Gabriel
  const { weekStart, weekEnd } = getWeekBoundaries(new Date());
  
  console.log('CHECKING ALL BADGE CALCULATIONS');
  console.log('=' .repeat(70));
  console.log(`User: Gabriel`);
  console.log(`Week: ${weekStart} to ${weekEnd}\n`);

  // Get all badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true);

  // Get all activities for this week
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_date_local', weekStart)
    .lte('start_date_local', weekEnd + 'T23:59:59')
    .is('deleted_at', null);

  // Get all activities ever (for cumulative badges)
  const { data: allActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);

  for (const badge of badges || []) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Badge: ${badge.name} (${badge.emoji})`);
    console.log(`Type: ${badge.criteria.type}`);
    console.log(`${'='.repeat(50)}`);

    // Get progress
    let progressQuery = supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id);
    
    if (badge.criteria.reset_period === 'weekly') {
      progressQuery = progressQuery.eq('period_start', weekStart);
    } else {
      progressQuery = progressQuery.is('period_start', null);
    }
    
    const { data: progress } = await progressQuery.single();

    switch (badge.criteria.type) {
      case 'weekly_cumulative': {
        // Recalculate from week activities
        let calculated = 0;
        const relevantActivities = activities?.filter(a => {
          if (badge.criteria.activity_type) {
            return a.type === badge.criteria.activity_type || a.sport_type === badge.criteria.activity_type;
          }
          return true;
        }) || [];

        for (const act of relevantActivities) {
          switch (badge.criteria.metric) {
            case 'moving_time_hours':
              calculated += (act.moving_time || 0) / 3600;
              break;
            case 'distance_miles':
              calculated += (act.distance || 0) / 1609.34;
              break;
            case 'suffer_score':
              calculated += act.suffer_score || 0;
              break;
          }
        }

        console.log(`  Activities counted: ${relevantActivities.length}`);
        console.log(`  Calculated value: ${calculated.toFixed(2)}`);
        console.log(`  Stored value: ${progress?.current_value || 0}`);
        
        if (Math.abs(calculated - (progress?.current_value || 0)) > 0.01) {
          console.log(`  ⚠️  MISMATCH! Should be ${calculated.toFixed(2)}`);
        } else {
          console.log(`  ✅ Values match`);
        }
        break;
      }

      case 'cumulative': {
        // Calculate from all activities
        let calculated = 0;
        const relevantActivities = allActivities?.filter(a => {
          if (badge.criteria.activity_type) {
            return a.type === badge.criteria.activity_type || a.sport_type === badge.criteria.activity_type;
          }
          return true;
        }) || [];

        for (const act of relevantActivities) {
          switch (badge.criteria.metric) {
            case 'elevation_gain':
              calculated += act.total_elevation_gain || 0;
              break;
            case 'distance_km':
              calculated += (act.distance || 0) / 1000;
              break;
          }
        }

        console.log(`  Total activities: ${relevantActivities.length}`);
        console.log(`  Calculated value: ${calculated.toFixed(2)}`);
        console.log(`  Stored value: ${progress?.current_value || 0}`);
        
        if (Math.abs(calculated - (progress?.current_value || 0)) > 0.01) {
          console.log(`  ⚠️  MISMATCH! Should be ${calculated.toFixed(2)}`);
        } else {
          console.log(`  ✅ Values match`);
        }
        break;
      }

      case 'single_activity': {
        // Check best single activity
        let bestValue = 0;
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
          }
          bestValue = Math.max(bestValue, value);
        }

        console.log(`  Best activity value: ${bestValue.toFixed(2)}`);
        console.log(`  Stored value: ${progress?.current_value || 0}`);
        
        if (Math.abs(bestValue - (progress?.current_value || 0)) > 0.01) {
          console.log(`  ⚠️  Stored value may not reflect best achievement`);
        }
        break;
      }

      case 'unique_sports': {
        // Check unique sports
        if (badge.criteria.sports_list) {
          const sportActivities = allActivities?.filter(a => 
            badge.criteria.sports_list.includes(a.sport_type)
          ) || [];
          
          const uniqueSports = new Set(sportActivities.map(a => a.sport_type));
          
          console.log(`  Sports found: ${Array.from(uniqueSports).join(', ') || 'None'}`);
          console.log(`  Unique count: ${uniqueSports.size}`);
          console.log(`  Stored value: ${progress?.current_value || 0}`);
          
          if (uniqueSports.size !== (progress?.current_value || 0)) {
            console.log(`  ⚠️  MISMATCH! Should be ${uniqueSports.size}`);
          } else {
            console.log(`  ✅ Values match`);
          }
        }
        break;
      }

      case 'weekly_count': {
        // Check weekly count (Belfie)
        if (badge.criteria.condition === 'photo_count > 0') {
          const weeksWithPhotos = new Set();
          
          // Check all activities ever
          for (const act of allActivities || []) {
            if ((act.photo_count || 0) > 0) {
              const { weekStart: actWeek } = getWeekBoundaries(new Date(act.start_date_local));
              weeksWithPhotos.add(actWeek);
            }
          }
          
          console.log(`  Weeks with photos: ${weeksWithPhotos.size}`);
          console.log(`  Stored value: ${progress?.current_value || 0}`);
          console.log(`  Metadata weeks: ${progress?.metadata?.counted_weeks?.length || 0}`);
          
          if (weeksWithPhotos.size !== (progress?.current_value || 0)) {
            console.log(`  ⚠️  May need recalculation`);
          }
        }
        break;
      }

      default:
        console.log(`  Badge type ${badge.criteria.type} not analyzed`);
    }

    // Check tier achievements
    if (progress) {
      const { bronze, silver, gold } = badge.criteria;
      const value = progress.current_value || 0;
      
      console.log(`\n  Tier Status:`);
      console.log(`    Bronze (${bronze}): ${progress.bronze_achieved ? '✅' : '❌'} ${value >= bronze ? '(should be ✅)' : ''}`);
      console.log(`    Silver (${silver}): ${progress.silver_achieved ? '✅' : '❌'} ${value >= silver ? '(should be ✅)' : ''}`);
      console.log(`    Gold (${gold}): ${progress.gold_achieved ? '✅' : '❌'} ${value >= gold ? '(should be ✅)' : ''}`);
    } else {
      console.log(`  No progress record found`);
    }
  }
}

checkAllBadges().catch(console.error);