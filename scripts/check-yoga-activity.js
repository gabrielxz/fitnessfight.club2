const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkYogaActivity() {
  console.log('🧘 Checking for fake yoga activity...\n');

  // First, check all recent activities
  const { data: recentActivities, error: recentError } = await supabase
    .from('strava_activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentError) {
    console.error('Error fetching recent activities:', recentError);
    return;
  }

  console.log('📋 Last 10 activities in database:');
  for (const act of recentActivities || []) {
    const date = new Date(act.start_date_local).toLocaleDateString();
    console.log(`  - ${act.name} (${act.type}/${act.sport_type}) - ${date} - ID: ${act.strava_activity_id}`);
  }

  // Check specifically for fake yoga
  const { data: yogaActivity, error: yogaError } = await supabase
    .from('strava_activities')
    .select('*')
    .ilike('name', '%yoga%')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n🧘 Activities with "yoga" in name:');
  if (yogaActivity && yogaActivity.length > 0) {
    for (const act of yogaActivity) {
      console.log(`\n  Found: ${act.name}`);
      console.log(`    ID: ${act.strava_activity_id}`);
      console.log(`    Type: ${act.type} / Sport: ${act.sport_type}`);
      console.log(`    Date: ${act.start_date_local}`);
      console.log(`    Duration: ${(act.moving_time / 60).toFixed(0)} minutes`);
      console.log(`    Manual: ${act.manual}`);
      console.log(`    Created: ${act.created_at}`);
    }
  } else {
    console.log('  ❌ No yoga activities found in database');
  }

  // Check Strava connections for token status
  console.log('\n🔗 Checking Strava connection status...');
  const { data: connections } = await supabase
    .from('strava_connections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (connections && connections[0]) {
    const conn = connections[0];
    const expiresAt = typeof conn.expires_at === 'string' 
      ? new Date(conn.expires_at).getTime() / 1000 
      : conn.expires_at;
    const now = Date.now() / 1000;
    const hoursUntilExpiry = (expiresAt - now) / 3600;
    
    console.log(`  User: ${conn.user_id}`);
    console.log(`  Athlete ID: ${conn.athlete_id}`);
    console.log(`  Token expires in: ${hoursUntilExpiry.toFixed(1)} hours`);
    console.log(`  Token valid: ${hoursUntilExpiry > 0 ? '✅' : '❌'}`);
    
    if (hoursUntilExpiry <= 0) {
      console.log('  ⚠️  TOKEN EXPIRED - webhooks will not work!');
    }
  }

  // Check webhook subscriptions
  console.log('\n🔔 Checking webhook subscription...');
  const { data: subs } = await supabase
    .from('strava_webhook_subscriptions')
    .select('*')
    .eq('active', true);

  if (subs && subs.length > 0) {
    console.log(`  ✅ Active webhook subscription found`);
    console.log(`    Subscription ID: ${subs[0].subscription_id}`);
    console.log(`    Created: ${subs[0].created_at}`);
  } else {
    console.log('  ❌ No active webhook subscription!');
  }

  // Check if badge calculation would work for yoga
  console.log('\n🏅 Checking Zen Master badge configuration...');
  const { data: zenBadge } = await supabase
    .from('badges')
    .select('*')
    .eq('code', 'zen_master')
    .single();

  if (zenBadge) {
    console.log(`  ✅ Zen Master badge exists`);
    console.log(`    Bronze: ${zenBadge.criteria.bronze} hours`);
    console.log(`    Silver: ${zenBadge.criteria.silver} hours`);
    console.log(`    Gold: ${zenBadge.criteria.gold} hours`);
    console.log(`    Type: ${zenBadge.criteria.type}`);
    console.log(`    Reset: ${zenBadge.criteria.reset_period}`);
  } else {
    console.log('  ❌ Zen Master badge not found!');
  }

  // Check current week's points
  console.log('\n📊 Checking current week points...');
  const weekStart = getWeekStart(new Date());
  const { data: points } = await supabase
    .from('user_points')
    .select('*')
    .eq('week_start', weekStart)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (points && points[0]) {
    console.log(`  Last update: ${points[0].updated_at}`);
    console.log(`  Exercise points: ${points[0].exercise_points}`);
    console.log(`  Total hours: ${points[0].total_hours}`);
    console.log(`  Activity count: ${points[0].activities_count}`);
  }
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const adjustedDay = day === 0 ? 7 : day;
  const diff = d.getUTCDate() - (adjustedDay - 1);
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  return weekStart.toISOString().split('T')[0];
}

checkYogaActivity();