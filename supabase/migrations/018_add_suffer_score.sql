-- Add suffer_score column to strava_activities table for tracking Relative Effort
-- This is needed for the Tryhard badge

ALTER TABLE strava_activities
ADD COLUMN IF NOT EXISTS suffer_score REAL;

-- Add comment explaining the field
COMMENT ON COLUMN strava_activities.suffer_score IS 'Strava Relative Effort score - measures workout intensity based on heart rate data';