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

async function checkFakeYoga3() {
  console.log('🧘 Checking "fake yoga 3" and badge calculation...\n');
  console.log('=' .repeat(70) + '\n');

  const { weekStart, weekEnd } = getWeekBoundaries(new Date());
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'; // Gabriel

  // 1. Check all yoga activities this week
  console.log('📋 ALL YOGA ACTIVITIES THIS WEEK:');
  console.log('-'.repeat(70));
  
  const { data: allActivities } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_date', weekStart)
    .lte('start_date', weekEnd + 'T23:59:59')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  let totalYogaHours = 0;
  let yogaCount = 0;
  
  console.log(`Week: ${weekStart} to ${weekEnd}\n`);
  
  for (const act of allActivities || []) {
    // Check if this is a yoga activity
    const isYoga = act.type === 'Yoga' || 
                   act.sport_type === 'Yoga' || 
                   act.name.toLowerCase().includes('yoga');
    
    if (isYoga) {
      const hours = act.moving_time / 3600;
      totalYogaHours += hours;
      yogaCount++;
      console.log(`✅ YOGA: ${act.name}`);
      console.log(`   ID: ${act.strava_activity_id}`);
      console.log(`   Type: ${act.type} / Sport: ${act.sport_type}`);
      console.log(`   Duration: ${hours.toFixed(2)} hours`);
      console.log(`   Created: ${act.created_at}`);
      console.log('');
    } else if (act.name.toLowerCase().includes('yoga')) {
      console.log(`❌ NAME HAS YOGA BUT TYPE IS WRONG: ${act.name}`);
      console.log(`   Type: ${act.type} / Sport: ${act.sport_type}`);
      console.log('   This won\'t count toward badge!\n');
    }
  }
  
  console.log(`\n📊 TOTAL: ${yogaCount} yoga activities, ${totalYogaHours.toFixed(2)} hours\n`);

  // 2. Check Zen Master badge configuration
  console.log('🏅 ZEN MASTER BADGE:');
  console.log('-'.repeat(70));
  
  const { data: badge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  if (badge) {
    console.log(`Badge ID: ${badge.id}`);
    console.log(`Criteria type: ${badge.criteria.type}`);
    console.log(`Bronze: ${badge.criteria.bronze} hours`);
    console.log(`Silver: ${badge.criteria.silver} hours`);
    console.log(`Gold: ${badge.criteria.gold} hours`);
    console.log(`Reset: ${badge.criteria.reset_period}\n`);
  }

  // 3. Check badge progress
  console.log('📈 BADGE PROGRESS:');
  console.log('-'.repeat(70));
  
  const { data: progress } = await supabase
    .from('badge_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badge?.id)
    .eq('period_start', weekStart)
    .single();

  if (progress) {
    console.log(`Current value: ${progress.current_value} hours`);
    console.log(`Bronze achieved: ${progress.bronze_achieved ? '✅' : '❌'}`);
    console.log(`Silver achieved: ${progress.silver_achieved ? '✅' : '❌'}`);
    console.log(`Gold achieved: ${progress.gold_achieved ? '✅' : '❌'}`);
    console.log(`Last updated: ${progress.last_updated}\n`);
    
    if (progress.current_value !== totalYogaHours) {
      console.log(`⚠️  MISMATCH: Progress shows ${progress.current_value} but actual is ${totalYogaHours.toFixed(2)}`);
    }
  } else {
    console.log('❌ No badge progress record found!\n');
  }

  // 4. Check if badge was awarded
  console.log('🏆 BADGE AWARDS:');
  console.log('-'.repeat(70));
  
  const { data: userBadge } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .eq('badge_id', badge?.id)
    .single();

  if (userBadge) {
    console.log(`Tier awarded: ${userBadge.tier}`);
    console.log(`Earned at: ${userBadge.earned_at}\n`);
  } else {
    console.log('❌ No badge awarded yet\n');
  }

  // 5. Check BadgeCalculator logic
  console.log('🔍 BADGECALCULATOR LOGIC CHECK:');
  console.log('-'.repeat(70));
  console.log('\nThe BadgeCalculator looks for:');
  console.log('1. type === "Yoga" OR sport_type === "Yoga"');
  console.log('2. Only activities in current week');
  console.log('3. Not deleted (deleted_at is null)\n');

  // Check the most recent "fake yoga 3"
  const { data: fakeYoga3 } = await supabase
    .from('strava_activities')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', '%fake yoga 3%')
    .single();

  if (fakeYoga3) {
    console.log('Found "fake yoga 3":');
    console.log(`  Type: ${fakeYoga3.type}`);
    console.log(`  Sport Type: ${fakeYoga3.sport_type}`);
    console.log(`  Will count for badge: ${fakeYoga3.type === 'Yoga' || fakeYoga3.sport_type === 'Yoga' ? '✅' : '❌'}`);
  }

  // 6. Diagnosis
  console.log('\n\n💡 DIAGNOSIS:');
  console.log('=' .repeat(70));
  
  if (totalYogaHours >= 4 && (!progress || !progress.silver_achieved)) {
    console.log('❌ PROBLEM: You have 4+ hours but no Silver badge!');
    console.log('\nPossible causes:');
    console.log('1. BadgeCalculator not running after webhook processing');
    console.log('2. Badge progress not being updated properly');
    console.log('3. Activity type/sport_type not set to "Yoga"');
  } else if (totalYogaHours >= 4 && progress?.silver_achieved) {
    console.log('✅ Silver should be achieved');
    if (!userBadge || userBadge.tier !== 'silver') {
      console.log('❌ But badge not awarded properly!');
    }
  }
}

checkFakeYoga3().catch(console.error);