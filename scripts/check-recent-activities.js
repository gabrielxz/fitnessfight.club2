const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRecentActivities() {
  console.log('Checking recent activities in database...\n');

  // Get activities from the last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: activities, error } = await supabase
    .from('strava_activities')
    .select('*')
    .gte('created_at', yesterday.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching activities:', error);
    return;
  }

  console.log(`Found ${activities?.length || 0} activities in the last 24 hours:\n`);

  if (activities && activities.length > 0) {
    activities.forEach(activity => {
      console.log(`Activity: ${activity.name}`);
      console.log(`  ID: ${activity.strava_activity_id}`);
      console.log(`  Type: ${activity.type} / ${activity.sport_type}`);
      console.log(`  User: ${activity.user_id}`);
      console.log(`  Date: ${activity.start_date_local}`);
      console.log(`  Distance: ${(activity.distance / 1609.34).toFixed(2)} miles`);
      console.log(`  Time: ${(activity.moving_time / 60).toFixed(0)} minutes`);
      console.log(`  Elevation: ${activity.total_elevation_gain} m`);
      console.log(`  Manual: ${activity.manual}`);
      console.log(`  Photos: ${activity.photo_count}`);
      console.log(`  Suffer Score: ${activity.suffer_score || 'N/A'}`);
      console.log(`  Created: ${activity.created_at}`);
      console.log('');
    });
  }

  // Also check for any "fake" or "test" activities
  console.log('\nChecking for test/fake activities...');
  const { data: testActivities, error: testError } = await supabase
    .from('strava_activities')
    .select('*')
    .or('name.ilike.%fake%,name.ilike.%test%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (testActivities && testActivities.length > 0) {
    console.log(`\nFound ${testActivities.length} test/fake activities:`);
    testActivities.forEach(activity => {
      console.log(`- ${activity.name} (${activity.start_date_local})`);
    });
  } else {
    console.log('No test/fake activities found');
  }

  // Check webhook events
  console.log('\n\nChecking recent webhook events...');
  const { data: webhooks, error: webhookError } = await supabase
    .from('strava_webhook_events')
    .select('*')
    .gte('created_at', yesterday.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  if (webhooks && webhooks.length > 0) {
    console.log(`\nFound ${webhooks.length} webhook events in the last 24 hours:`);
    webhooks.forEach(event => {
      console.log(`- ${event.aspect_type} ${event.object_type} (ID: ${event.object_id}) at ${event.created_at}`);
      if (event.updates) {
        console.log(`  Updates: ${JSON.stringify(event.updates)}`);
      }
    });
  } else {
    console.log('No recent webhook events found');
  }
}

checkRecentActivities();