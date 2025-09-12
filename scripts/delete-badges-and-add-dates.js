const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteBadgesAndAddDates() {
  console.log('Starting badge deletion and schema update...\n');

  try {
    // Step 1: Delete all user badges
    console.log('Step 1: Deleting all user badges...');
    const { error: userBadgeError, count: userBadgeCount } = await supabase
      .from('user_badges')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (userBadgeError) throw userBadgeError;
    console.log(`✓ Deleted ${userBadgeCount || 0} user badge records\n`);

    // Step 2: Delete all badge progress
    console.log('Step 2: Deleting all badge progress...');
    const { error: progressError, count: progressCount } = await supabase
      .from('badge_progress')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (progressError) throw progressError;
    console.log(`✓ Deleted ${progressCount || 0} badge progress records\n`);

    // Step 3: Delete all badge definitions
    console.log('Step 3: Deleting all badge definitions...');
    const { error: badgeError, count: badgeCount } = await supabase
      .from('badges')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (badgeError) throw badgeError;
    console.log(`✓ Deleted ${badgeCount || 0} badge definitions\n`);

    // Step 4: Reset badge points to 0
    console.log('Step 4: Resetting badge points to 0...');
    const { error: pointsError, count: pointsCount } = await supabase
      .from('user_points')
      .update({ badge_points: 0, updated_at: new Date().toISOString() })
      .gt('badge_points', 0);
    
    if (pointsError) throw pointsError;
    console.log(`✓ Reset badge points for ${pointsCount || 0} user_points records\n`);

    console.log('✅ All badge data has been deleted and points reset!\n');
    console.log('NOTE: The database schema changes (adding start_date and end_date columns) need to be');
    console.log('run manually in the Supabase SQL Editor. Copy the following SQL and run it:\n');
    console.log('----------------------------------------');
    console.log(`
-- Add date fields to badges table
ALTER TABLE badges
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add comments explaining the date fields
COMMENT ON COLUMN badges.start_date IS 'Optional start date for time-limited badges. NULL means badge is active from contest start.';
COMMENT ON COLUMN badges.end_date IS 'Optional end date for time-limited badges. NULL means badge is active until contest end.';

-- Add check constraint to ensure end_date is after start_date when both are set
ALTER TABLE badges
DROP CONSTRAINT IF EXISTS badges_date_check;

ALTER TABLE badges
ADD CONSTRAINT badges_date_check 
CHECK (
  (start_date IS NULL AND end_date IS NULL) OR
  (start_date IS NOT NULL AND end_date IS NULL) OR
  (start_date IS NULL AND end_date IS NOT NULL) OR
  (start_date < end_date)
);
    `);
    console.log('----------------------------------------\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteBadgesAndAddDates();