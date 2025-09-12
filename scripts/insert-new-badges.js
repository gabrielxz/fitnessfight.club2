const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const badges = [
  {
    code: 'tryhard',
    name: 'Tryhard',
    emoji: '🥵',
    category: 'intensity',
    description: "Score a certain amount of Strava's Relative Effort points in one week",
    criteria: {
      type: 'weekly_cumulative',
      metric: 'suffer_score',
      reset_period: 'weekly',
      bronze: 150,
      silver: 350,
      gold: 600
    }
  },
  {
    code: 'everester',
    name: 'Everester',
    emoji: '🏔',
    category: 'elevation',
    description: 'Activities with elevation gain (in meters, cumulative over whole contest)',
    criteria: {
      type: 'cumulative',
      metric: 'elevation_gain',
      bronze: 600,
      silver: 2212,
      gold: 4424
    }
  },
  {
    code: 'iron_calves',
    name: 'Iron Calves',
    emoji: '🐂',
    category: 'distance',
    description: 'Bike X # of miles in a week',
    criteria: {
      type: 'weekly_cumulative',
      metric: 'distance_miles',
      activity_type: 'Ride',
      reset_period: 'weekly',
      bronze: 10,
      silver: 50,
      gold: 90
    }
  },
  {
    code: 'zen_master',
    name: 'Zen Master',
    emoji: '🧘',
    category: 'activity',
    description: 'Log X hours of Yoga in a week',
    criteria: {
      type: 'weekly_cumulative',
      metric: 'moving_time_hours',
      activity_type: 'Yoga',
      reset_period: 'weekly',
      bronze: 1,
      silver: 4,
      gold: 10
    }
  },
  {
    code: 'belfie',
    name: 'Belfie',
    emoji: '📸',
    category: 'social',
    description: 'Attach a photo to at least one of your workouts in X number of weeks',
    criteria: {
      type: 'weekly_count',
      condition: 'photo_count > 0',
      bronze: 1,
      silver: 6,
      gold: 12
    }
  },
  {
    code: 'pitch_perfect',
    name: 'Pitch Perfect',
    emoji: '⚽',
    category: 'activity',
    description: 'Play Football (Soccer) for at least X minutes in a single session',
    criteria: {
      type: 'single_activity',
      metric: 'moving_time_minutes',
      activity_type: 'Soccer',
      bronze: 30,
      silver: 60,
      gold: 100
    }
  },
  {
    code: 'net_gain',
    name: 'Net Gain',
    emoji: '🎾',
    category: 'variety',
    description: 'Play X number of these distinct sports over the course of the contest: Pickleball, Racquetball, Badminton, Table Tennis, Tennis',
    criteria: {
      type: 'unique_sports',
      sports_list: ['Pickleball', 'Racquetball', 'Badminton', 'TableTennis', 'Tennis'],
      bronze: 1,
      silver: 2,
      gold: 4
    }
  }
];

async function insertBadges() {
  console.log('Inserting new badges...\n');

  for (const badge of badges) {
    try {
      const { data, error } = await supabase
        .from('badges')
        .insert({
          code: badge.code,
          name: badge.name,
          emoji: badge.emoji,
          category: badge.category,
          description: badge.description,
          criteria: badge.criteria,
          active: true
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error inserting ${badge.name}:`, error.message);
      } else {
        console.log(`✅ Inserted ${badge.emoji} ${badge.name} badge`);
      }
    } catch (err) {
      console.error(`❌ Unexpected error for ${badge.name}:`, err);
    }
  }

  console.log('\n✨ Badge insertion complete!');
}

insertBadges();