const { createClient } = require('@supabase/supabase-js');
const polyline = require('@mapbox/polyline');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('Need: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TIME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DISTANCE_THRESHOLD_M = 150; // 150 meters
const MIN_ELAPSED_TIME_S = 15 * 60; // 15 minutes

/**
 * Calculate Haversine distance between two coordinates in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Extract starting coordinates from an activity
 */
function extractCoordinates(activity) {
  // Decode polyline to get coordinates
  if (activity.map_summary_polyline) {
    try {
      const decoded = polyline.decode(activity.map_summary_polyline);
      if (decoded && decoded.length > 0) {
        return {
          lat: decoded[0][0],
          lng: decoded[0][1]
        };
      }
    } catch (error) {
      console.error(`Error decoding polyline for activity ${activity.strava_activity_id}:`, error.message);
    }
  }

  return null;
}

/**
 * Group activities by proximity
 */
function groupActivitiesByProximity(activitiesWithGPS) {
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < activitiesWithGPS.length; i++) {
    const activityA = activitiesWithGPS[i];

    // Skip if already assigned to a group
    if (assigned.has(activityA.activity.id)) continue;

    // Start a new group
    const group = [activityA];
    assigned.add(activityA.activity.id);

    // Find all activities that match this one
    for (let j = i + 1; j < activitiesWithGPS.length; j++) {
      const activityB = activitiesWithGPS[j];

      // Skip if already assigned
      if (assigned.has(activityB.activity.id)) continue;

      // Skip if same user (can't group with yourself)
      if (activityA.activity.user_id === activityB.activity.user_id) continue;

      // Check if this activity is close to ANY activity in the current group
      let matchesGroup = false;
      for (const groupMember of group) {
        // Check time difference
        const timeDiffMs = Math.abs(groupMember.timestamp.getTime() - activityB.timestamp.getTime());
        if (timeDiffMs > TIME_THRESHOLD_MS) continue;

        // Check distance
        const distanceM = haversineDistance(
          groupMember.coordinates.lat, groupMember.coordinates.lng,
          activityB.coordinates.lat, activityB.coordinates.lng
        );

        if (distanceM <= DISTANCE_THRESHOLD_M) {
          matchesGroup = true;
          break;
        }
      }

      if (matchesGroup) {
        group.push(activityB);
        assigned.add(activityB.activity.id);
      }
    }

    groups.push(group);
  }

  // Filter out solo activities (groups of 1)
  return groups.filter(g => g.length >= 2);
}

async function testPackAnimalDetection() {
  console.log('🐺 Testing Pack Animal Detection (DRY RUN)\n');
  console.log('Settings:');
  console.log(`  - Time threshold: ${TIME_THRESHOLD_MS / 1000 / 60} minutes`);
  console.log(`  - Distance threshold: ${DISTANCE_THRESHOLD_M} meters`);
  console.log(`  - Minimum duration: ${MIN_ELAPSED_TIME_S / 60} minutes`);
  console.log('');

  try {
    // Calculate cutoff time (last 24 hours)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    const cutoffISO = cutoffTime.toISOString();

    console.log(`Scanning activities since: ${cutoffTime.toLocaleString()}\n`);

    // Fetch activities with GPS data from the last 24 hours
    const { data: activities, error } = await supabase
      .from('strava_activities')
      .select('id, user_id, strava_activity_id, name, type, sport_type, start_date_local, elapsed_time, map_summary_polyline')
      .gte('start_date_local', cutoffISO)
      .gte('elapsed_time', MIN_ELAPSED_TIME_S)
      .is('deleted_at', null)
      .order('start_date_local', { ascending: true });

    if (error) {
      console.error('Error fetching activities:', error);
      process.exit(1);
    }

    if (!activities || activities.length === 0) {
      console.log('No qualifying activities found in the last 24 hours');
      process.exit(0);
    }

    console.log(`Found ${activities.length} activities (≥15 min) in the last 24 hours\n`);

    // Get user profiles for display names
    const userIds = [...new Set(activities.map(a => a.user_id))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const userMap = new Map();
    if (profiles) {
      profiles.forEach(p => {
        userMap.set(p.id, p.full_name || p.email || p.id.substring(0, 8));
      });
    }

    // Extract coordinates and filter out activities without GPS data
    const activitiesWithGPS = [];

    for (const activity of activities) {
      const coords = extractCoordinates(activity);
      if (coords) {
        activitiesWithGPS.push({
          activity,
          coordinates: coords,
          timestamp: new Date(activity.start_date_local)
        });
      } else {
        console.log(`⚠️  Activity ${activity.strava_activity_id} (${activity.name}) has no GPS data`);
      }
    }

    console.log(`\n${activitiesWithGPS.length} activities have GPS data\n`);

    if (activitiesWithGPS.length < 2) {
      console.log('Not enough GPS activities to form groups');
      process.exit(0);
    }

    // Group activities by proximity
    const groups = groupActivitiesByProximity(activitiesWithGPS);

    console.log(`Detected ${groups.length} group(s)\n`);
    console.log('═'.repeat(80));

    // Display groups
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const userCount = group.length;

      console.log(`\n📍 GROUP ${i + 1}: ${userCount} participant(s)`);
      console.log('─'.repeat(80));

      // Determine tier
      let tier = null;
      if (userCount >= 6) tier = 'GOLD';
      else if (userCount >= 3) tier = 'SILVER';
      else if (userCount >= 2) tier = 'BRONZE';

      if (tier) {
        console.log(`🏅 Tier: ${tier} (${userCount} users)`);
      }

      console.log('');

      // Display each activity in the group
      for (const groupedActivity of group) {
        const act = groupedActivity.activity;
        const userName = userMap.get(act.user_id) || act.user_id.substring(0, 8);
        const time = new Date(act.start_date_local).toLocaleString();
        const coords = groupedActivity.coordinates;

        console.log(`  👤 ${userName}`);
        console.log(`     Activity: ${act.name} (${act.type}/${act.sport_type})`);
        console.log(`     Time: ${time}`);
        console.log(`     Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
        console.log(`     Duration: ${Math.round(act.elapsed_time / 60)} minutes`);
        console.log(`     Strava ID: ${act.strava_activity_id}`);
        console.log('');
      }

      if (tier) {
        console.log(`  ✅ Would award ${tier} Pack Animal badge to all ${userCount} participants`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Detection complete (DRY RUN - no badges were actually awarded)\n');

  } catch (error) {
    console.error('Error during detection:', error);
    process.exit(1);
  }
}

testPackAnimalDetection();
