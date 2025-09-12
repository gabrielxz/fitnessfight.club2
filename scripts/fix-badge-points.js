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

async function fixBadgePoints() {
  console.log('🔧 Fixing badge points for all users...\n');

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

  // Get all badges earned by the user
  const { data: earnedBadges, error: badgeError } = await supabase
    .from('user_badges')
    .select('*, badges(*)')
    .eq('user_id', userId);

  if (badgeError) {
    console.error('Error fetching badges:', badgeError);
    return;
  }

  // Calculate total badge points
  let totalPoints = 0;
  console.log('📊 Earned badges:');
  
  for (const earnedBadge of earnedBadges || []) {
    let points = 0;
    if (earnedBadge.tier === 'gold') points = 15;
    else if (earnedBadge.tier === 'silver') points = 6;
    else if (earnedBadge.tier === 'bronze') points = 3;
    
    totalPoints += points;
    console.log(`  ${earnedBadge.badges.emoji} ${earnedBadge.badges.name} - ${earnedBadge.tier} (${points} points)`);
  }

  console.log(`\n  Total badge points: ${totalPoints}`);

  // Update user_points for this week
  const { data: existingPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  if (existingPoints) {
    const { error: updateError } = await supabase
      .from('user_points')
      .update({ 
        badge_points: totalPoints,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('week_start', weekStart);

    if (updateError) {
      console.error('❌ Error updating badge points:', updateError);
    } else {
      console.log(`\n✅ Updated badge points from ${existingPoints.badge_points} to ${totalPoints}`);
      
      // Show final totals
      const total = existingPoints.exercise_points + existingPoints.habit_points + totalPoints;
      console.log('\n📈 Final point totals for this week:');
      console.log(`  Exercise: ${existingPoints.exercise_points}`);
      console.log(`  Habits: ${existingPoints.habit_points}`);
      console.log(`  Badges: ${totalPoints}`);
      console.log(`  TOTAL: ${total}`);
    }
  } else {
    console.log('No points record found for this week');
  }
}

fixBadgePoints();