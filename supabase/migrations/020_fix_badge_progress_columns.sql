-- Fix badge_progress table by adding missing columns from migration 007
-- These columns are required for weekly badge tracking

-- Add missing columns
ALTER TABLE badge_progress 
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE,
ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient period queries
CREATE INDEX IF NOT EXISTS idx_badge_progress_period 
ON badge_progress(user_id, badge_id, period_start);

-- Update the unique constraint to include period_start for weekly badges
-- First drop the existing constraint if it exists
ALTER TABLE badge_progress 
DROP CONSTRAINT IF EXISTS badge_progress_user_id_badge_id_key;

-- Create unique constraint for weekly badges (with period_start)
ALTER TABLE badge_progress
ADD CONSTRAINT badge_progress_user_badge_period_unique 
UNIQUE (user_id, badge_id, period_start);

-- Add comments for documentation
COMMENT ON COLUMN badge_progress.period_start IS 'Start date of the current period for periodic badges';
COMMENT ON COLUMN badge_progress.period_end IS 'End date of the current period for periodic badges';
COMMENT ON COLUMN badge_progress.last_reset_at IS 'Timestamp of the last progress reset for periodic badges';