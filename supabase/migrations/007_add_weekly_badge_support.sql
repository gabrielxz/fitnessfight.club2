-- Add support for weekly badge resets
-- This migration adds fields to track period-based badge progress

-- Add reset_period to badge criteria (stored in JSONB, so no schema change needed)
-- Example: criteria->>'reset_period' = 'weekly'

-- Add period tracking to badge_progress
ALTER TABLE badge_progress 
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE,
ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP WITH TIME ZONE;

-- Update existing records to have no period (cumulative badges)
UPDATE badge_progress 
SET period_start = NULL,
    period_end = NULL,
    last_reset_at = NULL
WHERE period_start IS NULL;

-- Create index for efficient period queries
CREATE INDEX IF NOT EXISTS idx_badge_progress_period 
ON badge_progress(user_id, badge_id, period_start);

-- Add comment explaining the fields
COMMENT ON COLUMN badge_progress.period_start IS 'Start date of the current period for periodic badges (e.g., week start for weekly badges)';
COMMENT ON COLUMN badge_progress.period_end IS 'End date of the current period for periodic badges';
COMMENT ON COLUMN badge_progress.last_reset_at IS 'Timestamp of the last progress reset for periodic badges';