-- Create table for storing Strava activities
CREATE TABLE IF NOT EXISTS strava_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  strava_activity_id BIGINT UNIQUE NOT NULL,
  strava_athlete_id BIGINT NOT NULL,
  name TEXT,
  distance REAL, -- meters
  moving_time INTEGER, -- seconds
  elapsed_time INTEGER, -- seconds
  total_elevation_gain REAL, -- meters
  type TEXT, -- Run, Ride, Swim, etc.
  sport_type TEXT, -- More specific sport type
  start_date TIMESTAMP WITH TIME ZONE,
  start_date_local TIMESTAMP WITH TIME ZONE,
  timezone TEXT,
  achievement_count INTEGER,
  kudos_count INTEGER,
  comment_count INTEGER,
  athlete_count INTEGER,
  photo_count INTEGER,
  map_summary_polyline TEXT,
  trainer BOOLEAN DEFAULT FALSE,
  commute BOOLEAN DEFAULT FALSE,
  manual BOOLEAN DEFAULT FALSE,
  private BOOLEAN DEFAULT FALSE,
  visibility TEXT,
  flagged BOOLEAN DEFAULT FALSE,
  average_speed REAL, -- meters per second
  max_speed REAL, -- meters per second
  average_cadence REAL,
  average_heartrate REAL,
  max_heartrate REAL,
  average_watts REAL,
  kilojoules REAL,
  device_watts BOOLEAN,
  has_heartrate BOOLEAN DEFAULT FALSE,
  calories REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete for when activities are deleted on Strava
);

-- Create indexes for common queries
CREATE INDEX idx_strava_activities_user_id ON strava_activities(user_id);
CREATE INDEX idx_strava_activities_start_date ON strava_activities(start_date);
CREATE INDEX idx_strava_activities_type ON strava_activities(type);
CREATE INDEX idx_strava_activities_user_start ON strava_activities(user_id, start_date DESC);
CREATE INDEX idx_strava_activities_deleted ON strava_activities(deleted_at);

-- Enable RLS
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own activities
CREATE POLICY "Users can view own activities" ON strava_activities
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow the service to insert activities
CREATE POLICY "Service can insert activities" ON strava_activities
  FOR INSERT WITH CHECK (true);

-- Create policy to allow the service to update activities
CREATE POLICY "Service can update activities" ON strava_activities
  FOR UPDATE USING (true);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_strava_activities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_strava_activities_updated_at
  BEFORE UPDATE ON strava_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_strava_activities_updated_at();

-- Create a view for weekly statistics
CREATE OR REPLACE VIEW weekly_activity_stats AS
SELECT 
  user_id,
  DATE_TRUNC('week', start_date) as week_start,
  SUM(moving_time) / 3600.0 as total_hours,
  COUNT(*) as activity_count,
  SUM(distance) / 1000.0 as total_distance_km,
  SUM(total_elevation_gain) as total_elevation_m,
  SUM(calories) as total_calories
FROM strava_activities
WHERE deleted_at IS NULL
GROUP BY user_id, DATE_TRUNC('week', start_date);

-- Create webhook events log table for debugging and replay
CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aspect_type TEXT NOT NULL, -- create, update, delete
  event_time TIMESTAMP WITH TIME ZONE,
  object_id BIGINT NOT NULL,
  object_type TEXT NOT NULL, -- activity, athlete
  owner_id BIGINT NOT NULL,
  subscription_id INTEGER,
  updates JSONB,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for webhook events
CREATE INDEX idx_webhook_events_processed ON strava_webhook_events(processed, created_at);
CREATE INDEX idx_webhook_events_object ON strava_webhook_events(object_type, object_id);