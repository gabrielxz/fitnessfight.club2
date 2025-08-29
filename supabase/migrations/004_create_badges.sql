-- Create badges table
CREATE TABLE badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- 'early_bird', 'night_owl', etc.
  name TEXT NOT NULL, -- 'Early Bird'
  description TEXT,
  emoji TEXT NOT NULL, -- '🌅'
  category TEXT NOT NULL, -- 'time', 'distance', 'activity'
  criteria JSONB NOT NULL, -- Detailed criteria for each tier
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert badge definitions
INSERT INTO badges (code, name, emoji, category, criteria) VALUES
('early_bird', 'Early Bird', '🌅', 'time', '{
  "type": "count",
  "condition": "start_hour < 7",
  "bronze": 5,
  "silver": 20,
  "gold": 50
}'::jsonb),
('night_owl', 'Night Owl', '🌙', 'time', '{
  "type": "count",
  "condition": "start_hour >= 21",
  "bronze": 5,
  "silver": 20,
  "gold": 50
}'::jsonb),
('power_hour', 'Power Hour', '⚡', 'intensity', '{
  "type": "single_activity",
  "metric": "calories_per_hour",
  "bronze": 300,
  "silver": 500,
  "gold": 900
}'::jsonb),
('consistency_king', 'Consistency King', '👑', 'streak', '{
  "type": "weekly_streak",
  "bronze": 4,
  "silver": 12,
  "gold": 26
}'::jsonb),
('globe_trotter', 'Globe Trotter', '🌍', 'distance', '{
  "type": "cumulative",
  "metric": "distance_km",
  "bronze": 100,
  "silver": 500,
  "gold": 1000
}'::jsonb),
('mountain_climber', 'Mountain Climber', '🏔️', 'elevation', '{
  "type": "cumulative",
  "metric": "elevation_gain",
  "bronze": 1000,
  "silver": 5000,
  "gold": 10000
}'::jsonb),
('speed_demon', 'Speed Demon', '🚀', 'speed', '{
  "type": "single_activity",
  "metric": "average_speed_kmh",
  "activity_type": "Ride",
  "bronze": 25,
  "silver": 30,
  "gold": 35
}'::jsonb),
('runner', 'Runner', '🏃', 'activity', '{
  "type": "cumulative",
  "metric": "distance_km",
  "activity_type": "Run",
  "bronze": 50,
  "silver": 200,
  "gold": 500
}'::jsonb),
('cyclist', 'Cyclist', '🚴', 'activity', '{
  "type": "cumulative",
  "metric": "distance_km",
  "activity_type": "Ride",
  "bronze": 200,
  "silver": 1000,
  "gold": 5000
}'::jsonb),
('variety_pack', 'Variety Pack', '🎯', 'variety', '{
  "type": "unique_sports",
  "bronze": 3,
  "silver": 5,
  "gold": 8
}'::jsonb);

-- Create user_badges table
CREATE TABLE user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  progress_value DECIMAL(10, 2), -- Current progress toward next tier
  next_tier_target DECIMAL(10, 2), -- Target for next tier
  activities_contributing INTEGER[], -- Array of activity IDs that contributed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- Indexes for user_badges
CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX idx_user_badges_earned_at ON user_badges(earned_at DESC);

-- RLS for user_badges
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all badges" ON user_badges
  FOR SELECT USING (true);

-- Create badge_progress table (for tracking progress)
CREATE TABLE badge_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  current_value DECIMAL(10, 2) DEFAULT 0,
  bronze_achieved BOOLEAN DEFAULT false,
  silver_achieved BOOLEAN DEFAULT false,
  gold_achieved BOOLEAN DEFAULT false,
  last_activity_id BIGINT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- Store additional tracking data
  UNIQUE(user_id, badge_id)
);

-- Indexes for badge_progress
CREATE INDEX idx_badge_progress_user_badge ON badge_progress(user_id, badge_id);

-- RLS for badge_progress (internal use, no public access)
ALTER TABLE badge_progress ENABLE ROW LEVEL SECURITY;

-- No public policies for badge_progress as it's for internal calculations only