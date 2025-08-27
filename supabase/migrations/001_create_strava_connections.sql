-- Create table for storing Strava connections
CREATE TABLE IF NOT EXISTS strava_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  strava_athlete_id BIGINT UNIQUE,
  strava_firstname TEXT,
  strava_lastname TEXT,
  strava_profile TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE strava_connections ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view their own connection
CREATE POLICY "Users can view own strava connection" ON strava_connections
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own connection
CREATE POLICY "Users can insert own strava connection" ON strava_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own connection
CREATE POLICY "Users can update own strava connection" ON strava_connections
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own connection
CREATE POLICY "Users can delete own strava connection" ON strava_connections
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_strava_connections_updated_at
  BEFORE UPDATE ON strava_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();